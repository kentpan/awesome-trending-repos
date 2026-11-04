#!/usr/bin/env node

/**
 * 站点数据验证脚本
 *
 * 用途: 每天更新并推送后, 真实请求一次站点接口, 确认"数据确实落地了"。
 * 之前的推送失败(Cloudflare 拦截 / 后端 500 / worker 转发失败)只在日志里 warn,
 * 工作流依然是绿的, 站点却一直没数据。这个脚本就是用来兜住这种情况的。
 *
 * 用法:
 *   node scripts/verify-site.js                 # 校验最新榜单数据是否为近期数据
 *   node scripts/verify-site.js --date 2026-11-04
 *   node scripts/verify-site.js --max-age 2     # 允许最多落后几天(默认 2)
 *
 * 环境变量:
 *   SITE_BASE_URL   站点地址, 默认 https://www.xubaoge.com
 */

import axios from 'axios';
import { SITE_BASE_URL } from './config.js';

const CLI_ARGS = process.argv.slice(2);

function getArg(name, defaultValue = null) {
  const idx = CLI_ARGS.indexOf(name);
  if (idx === -1) return defaultValue;
  return CLI_ARGS[idx + 1] ?? defaultValue;
}

const MAX_AGE_DAYS = Number(getArg('--max-age', process.env.VERIFY_MAX_AGE_DAYS || 2));
const EXPECT_DATE = getArg('--date', null);
const TIMEOUT = Number(process.env.VERIFY_TIMEOUT || 30000);

function fail(message) {
  console.error(`\n❌ 验证失败: ${message}`);
  console.log('::error::站点数据验证失败: ' + message);
  process.exit(1);
}

function daysBetween(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24);
}

async function main() {
  const url = `${SITE_BASE_URL.replace(/\/+$/, '')}/api/trending/list`;
  console.log(`🔎 验证站点数据: POST ${url}`);

  let res;
  try {
    res = await axios.post(url, {}, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'awesome-trending-repos-verify/1.0 (+github-actions)'
      },
      timeout: TIMEOUT,
      validateStatus: () => true
    });
  } catch (error) {
    fail(`请求站点接口异常: ${error.message}`);
  }

  const body = res.data;

  if (res.status === 403 || (typeof body === 'string' && /Just a moment|cf-browser-verification/i.test(body))) {
    fail(`被 Cloudflare 人机校验拦截 (HTTP ${res.status})。请确认 SITE_BASE_URL 使用 www 域名, 或在 Cloudflare 放行 Actions 出口 IP`);
  }

  if (res.status !== 200) {
    const detail = typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200);
    fail(`HTTP ${res.status}: ${detail}`);
  }

  if (!body || typeof body !== 'object') {
    fail(`返回内容不是 JSON: ${String(body).slice(0, 200)}`);
  }

  if (body.code !== 200) {
    fail(`接口返回 code=${body.code}, msg=${body.msg}`);
  }

  const stars = body.data?.stars;
  const forks = body.data?.forks;

  if (!stars || !Array.isArray(stars.list) || stars.list.length === 0) {
    fail('stars 榜单为空, 站点没有拿到今天的数据');
  }

  if (!forks || !Array.isArray(forks.list) || forks.list.length === 0) {
    fail('forks 榜单为空, 站点没有拿到今天的数据');
  }

  const dataDate = stars.date;
  if (!dataDate) {
    fail('榜单没有返回 date 字段, 无法判断数据新旧');
  }

  console.log(`  ℹ️ 接口返回: date=${dataDate}, stars=${stars.list.length}, forks=${forks.list.length}, source=${stars.source || '-'}`);

  if (EXPECT_DATE) {
    if (dataDate !== EXPECT_DATE) {
      fail(`期望日期 ${EXPECT_DATE}, 实际 ${dataDate}`);
    }
  } else {
    const lag = daysBetween(dataDate, new Date());
    if (lag > MAX_AGE_DAYS) {
      fail(`榜单数据落后 ${lag.toFixed(1)} 天 (date=${dataDate}, 允许 ${MAX_AGE_DAYS} 天)`);
    }
  }

  const first = stars.list[0] || {};
  console.log(`  ✅ 验证通过: 最新榜单 ${first.author || ''}/${first.name || ''}, 数据日期 ${dataDate}`);
}

main().catch(error => fail(error.message));
