import { Octokit } from "@octokit/rest";
import pLimit from "p-limit";

// Create Octokit with throttling and retry
const MyOctokit = Octokit.plugin(throttling, retry);

/**
 * Initialize Octokit instance with retry and throttling
 */
function getOctokit() {
  const token = process.env.GITHUB_TOKEN;

  return new MyOctokit({
    auth: token || undefined,
    throttle: {
      onRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`Request quota exhausted for ${options.method} ${options.url}`);

        // Retry up to 2 times
        if (options.request.retryCount <= 2) {
          octokit.log.info(`Retrying after ${retryAfter}s!`);
          return true;
        }
        return false;
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`Secondary quota detected for ${options.method} ${options.url}`);
        // Does not retry secondary rate limits
        return false;
      }
    },
    retry: {
      doNotRetry: ['404', '422'] // Don't retry on these errors
    }
  });
}

/**
 * 批量获取用户头像
 * @param {string[]} owners - GitHub 用户名数组
 * @param {number} [concurrency=5] - 并发数，默认为 5
 * @returns {Promise<Array>} - 返回包含用户名、头像地址或错误信息的对象数组
 */
async function fetchBatchAvatars(owners, concurrency = 5) {
  // 1. 初始化 Octokit
  // 建议设置 GITHUB_TOKEN 环境变量以提高 API 速率限制
  
  const octokit = getOctokit();

  // 2. 初始化并发控制器
  const limit = pLimit(concurrency);

  // 3. 创建任务队列
  // 使用 map 遍历 owners，为每个 owner 创建一个请求任务
  // 使用 limit() 包裹 async 函数，确保并发数受到限制
  const tasks = owners.map((owner) => {
    return limit(async () => {
      try {
        console.log(`[Start] Fetching: ${owner}`);
        
        // 调用 GitHub API
        const { data } = await octokit.rest.users.getByUsername({
          username: owner,
        });

        console.log(`[Success] ${owner} - ${data.avatar_url}`);
        
        return {
          username: owner,
          avatarUrl: data.avatar_url,
          success: true,
        };
      } catch (error) {
        // 捕获单个请求的错误，避免整个批处理失败
        console.error(`[Error] ${owner} - ${error.message}`);
        
        return {
          username: owner,
          error: error.message,
          success: false,
        };
      }
    });
  });

  // 4. 等待所有任务完成
  // Promise.all 会保持返回结果的顺序与输入数组 owners 的顺序一致
  return Promise.all(tasks);
}

/**
 * 批量获取用户头像
 * @param {*} owners 
 * @param {*} batchSize 
 * @returns Object - { username: avatarUrl }
 */
async function getUsersAvatar(owners, batchSize = 5) {
  const results = await fetchBatchAvatars(owners, batchSize);
  const avatars = results.reduce((acc, cur) => {
    if (cur.success) {
      acc[cur.username] = cur.avatar;
    }
    return acc;
  }, {});
  return avatars;
}

export default { fetchBatchAvatars, getUsersAvatar };