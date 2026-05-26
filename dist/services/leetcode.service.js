"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLeetCodeStats = void 0;
const axios_1 = __importDefault(require("axios"));
const LC_GRAPHQL = "https://leetcode.com/graphql";
const LC_QUERY = `
  query getUserProfile($username: String!) {
    matchedUser(username: $username) {
      submitStatsGlobal {
        acSubmissionNum {
          difficulty
          count
        }
      }
      submitStats {
        acSubmissionNum {
          difficulty
          count
        }
      }
      profile {
        ranking
      }
    }
  }
`;
const fetchLeetCodeStats = async (username) => {
    let data;
    try {
        const res = await axios_1.default.post(LC_GRAPHQL, { query: LC_QUERY, variables: { username } }, {
            headers: {
                "Content-Type": "application/json",
                "Referer": "https://leetcode.com",
                "Origin": "https://leetcode.com",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "x-csrftoken": "leetcode",
                "Cookie": "csrftoken=leetcode",
            },
            timeout: 12000,
        });
        data = res.data;
    }
    catch (err) {
        throw new Error(`LeetCode API request failed: ${err.message}`);
    }
    const user = data?.data?.matchedUser;
    if (!user) {
        throw new Error(`LeetCode user "${username}" not found or profile is private`);
    }
    // Prefer global stats; fall back to current-year stats
    const statsList = user.submitStatsGlobal?.acSubmissionNum ||
        user.submitStats?.acSubmissionNum ||
        [];
    const getCount = (diff) => statsList.find((s) => s.difficulty === diff)?.count ?? 0;
    return {
        totalSolved: getCount("All"),
        easySolved: getCount("Easy"),
        mediumSolved: getCount("Medium"),
        hardSolved: getCount("Hard"),
        ranking: user.profile?.ranking ?? 0,
    };
};
exports.fetchLeetCodeStats = fetchLeetCodeStats;
