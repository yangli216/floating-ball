const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json());

const APPKEY = 'A874F37BD2D8B76F';
const APP_SECRET = '6044C30BCA9E9F1F9663F58B344345BAAF1DEDC490CB4FA7';
const TOKEN_URL = 'https://inside.pmphai.com/oauth2/access_token';
const API_BASE_URL = 'https://inside.pmphai.com/gateway/cloud/cloudapi/rest/json';
const API_BASE_URL_STANDARD = 'https://inside.pmphai.com/gateway/cloud/cloudapi/rest';

let accessToken = null;
let refreshToken = null;

// Function to get the access token
async function getAccessToken() {
    const timestamp = Date.now();
    const params = {
        app_key: APPKEY,
        grant_type: 'access_token',
        timestamp: timestamp,
    };

    // 参数1：按参数名首字母排序，用 & 连接
    const sortedKeys = Object.keys(params).sort();
    const param1 = sortedKeys.map(key => `${key}=${params[key]}`).join('&');

    // 参数2：云应用密钥
    const param2 = APP_SECRET;

    // 参数3：云应用 app_key
    const param3 = APPKEY;

    // 加密字符串 = 参数1 + 参数2 + 参数3
    const signString = param1 + param2 + param3;
    const sign = crypto.createHash('md5').update(signString).digest('hex');

    try {
        const data = new URLSearchParams({
            ...params,
            sign: sign
        });

        console.log('🔐 Requesting access token...');
        console.log('Param1:', param1);
        console.log('Sign string:', signString);
        console.log('Sign:', sign);

        const response = await axios.post(TOKEN_URL, data, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (response.data && response.data.data && response.data.data.accessToken) {
            accessToken = response.data.data.accessToken;
            refreshToken = response.data.data.refreshToken;
            console.log('✅ Access token obtained successfully');
            console.log('Token:', accessToken.substring(0, 20) + '...');
            console.log('Refresh Token:', refreshToken ? refreshToken.substring(0, 20) + '...' : 'N/A');
            console.log('Expires in:', response.data.data.expiresIn, 'seconds');
        } else {
            console.error('❌ Failed to obtain access token:', response.data);
        }
    } catch (error) {
        console.error('❌ Error getting access token:', error.response ? error.response.data : error.message);
    }
}

// Function to refresh the access token
async function refreshAccessToken() {
    if (!refreshToken) {
        console.log('⚠️ No refresh token available, getting new access token');
        return await getAccessToken();
    }

    const params = {
        app_key: APPKEY,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
    };

    // 参数1：按参数名首字母排序，用 & 连接
    const sortedKeys = Object.keys(params).sort();
    const param1 = sortedKeys.map(key => `${key}=${params[key]}`).join('&');

    // 参数2：云应用密钥
    const param2 = APP_SECRET;

    // 参数3：云应用 app_key
    const param3 = APPKEY;

    // 加密字符串 = 参数1 + 参数2 + 参数3
    const signString = param1 + param2 + param3;
    const sign = crypto.createHash('md5').update(signString).digest('hex');

    try {
        const data = new URLSearchParams({
            ...params,
            sign: sign
        });

        console.log('🔄 Refreshing access token...');
        const response = await axios.post(TOKEN_URL, data, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (response.data && response.data.data && response.data.data.accessToken) {
            accessToken = response.data.data.accessToken;
            refreshToken = response.data.data.refreshToken;
            console.log('✅ Token refreshed successfully');
        } else {
            console.error('❌ Failed to refresh token:', response.data);
            // 如果刷新失败，尝试获取新 token
            await getAccessToken();
        }
    } catch (error) {
        console.error('❌ Error refreshing token:', error.response ? error.response.data : error.message);
        // 如果刷新失败，尝试获取新 token
        await getAccessToken();
    }
}

app.post('/api/search', async (req, res) => {
    if (!accessToken) {
        await getAccessToken();
    }

    const { query, type, limit, score, enableAbstract } = req.body;

    // Build request body with all parameters
    const requestBody = {
        query: query,
        type: type !== undefined ? type : 1,
        limit: limit || 10
    };

    // Add optional parameters
    if (score !== undefined && score > 0) {
        requestBody.score = score;
    }
    if (enableAbstract !== undefined) {
        requestBody.enableAbstract = enableAbstract;
    }

    console.log('Search request:', requestBody);

    try {
        const response = await axios.post(`${API_BASE_URL}?token=${accessToken}&method=aiKnowledge`, requestBody);
        res.json(response.data);
    } catch (error) {
        if (error.response && error.response.status === 401) {
            // Token might be expired, refresh it and retry
            await refreshAccessToken();
            if (accessToken) {
                try {
                    const response = await axios.post(`${API_BASE_URL}?token=${accessToken}&method=aiKnowledge`, requestBody);
                    res.json(response.data);
                } catch (retryError) {
                    console.error('Retry error:', retryError.response ? retryError.response.data : retryError.message);
                    res.status(500).json({ success: false, message: 'Internal Server Error after retry' });
                }
            } else {
                res.status(500).json({ success: false, message: 'Failed to refresh token' });
            }
        } else {
            console.error('Search error:', error.response ? error.response.data : error.message);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }
});

app.post('/api/clip', async (req, res) => {
    if (!accessToken) {
        await getAccessToken();
    }

    const { id } = req.body;

    try {
        const response = await axios.post(`${API_BASE_URL}?token=${accessToken}&method=aiKnowledgeClip`, {
            id: id,
        });
        res.json(response.data);
    } catch (error) {
        if (error.response && error.response.status === 401) {
            // Token might be expired, refresh it and retry
            await refreshAccessToken();
            if (accessToken) {
                try {
                    const response = await axios.post(`${API_BASE_URL}?token=${accessToken}&method=aiKnowledgeClip`, {
                        id: id,
                    });
                    res.json(response.data);
                } catch (retryError) {
                    res.status(500).json({ success: false, message: 'Internal Server Error after retry' });
                }
            } else {
                res.status(500).json({ success: false, message: 'Failed to refresh token' });
            }
        } else {
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }
});

// 获取知识库列表接口
app.post('/api/kgbases', async (req, res) => {
    if (!accessToken) {
        await getAccessToken();
    }

    const { kgBaseId } = req.body;

    // 使用 JSON 格式，method 放在 URL 参数中（与其他接口保持一致）
    const requestBody = {};
    if (kgBaseId) {
        requestBody.kgBaseId = kgBaseId;
    }

    console.log('📚 KgBases request:', requestBody);

    try {
        const response = await axios.post(`${API_BASE_URL_STANDARD}?token=${accessToken}&method=kgbases`, requestBody);
        res.json(response.data);
    } catch (error) {
        if (error.response && error.response.status === 401) {
            await refreshAccessToken();
            if (accessToken) {
                try {
                    const response = await axios.post(`${API_BASE_URL_STANDARD}?token=${accessToken}&method=kgbases`, requestBody);
                    res.json(response.data);
                } catch (retryError) {
                    console.error('Retry error:', retryError.response ? retryError.response.data : retryError.message);
                    res.status(500).json({ success: false, message: 'Internal Server Error after retry' });
                }
            } else {
                res.status(500).json({ success: false, message: 'Failed to refresh token' });
            }
        } else {
            console.error('KgBases error:', error.response ? error.response.data : error.message);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }
});

// 获取知识库的分类接口
app.post('/api/tag', async (req, res) => {
    if (!accessToken) {
        await getAccessToken();
    }

    const { kgBaseId } = req.body;

    if (!kgBaseId) {
        return res.status(400).json({ success: false, message: '知识库ID是必填项' });
    }

    // 使用 form-urlencoded 格式
    const params = new URLSearchParams();
    params.append('method', 'tag');
    params.append('kgBaseId', kgBaseId);

    console.log('🏷️ Tag request:', params.toString());

    try {
        const response = await axios.post(`${API_BASE_URL_STANDARD}?token=${accessToken}`, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        res.json(response.data);
    } catch (error) {
        if (error.response && error.response.status === 401) {
            await refreshAccessToken();
            if (accessToken) {
                try {
                    const response = await axios.post(`${API_BASE_URL_STANDARD}?token=${accessToken}`, params, {
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    });
                    res.json(response.data);
                } catch (retryError) {
                    console.error('Retry error:', retryError.response ? retryError.response.data : retryError.message);
                    res.status(500).json({ success: false, message: 'Internal Server Error after retry' });
                }
            } else {
                res.status(500).json({ success: false, message: 'Failed to refresh token' });
            }
        } else {
            console.error('Tag error:', error.response ? error.response.data : error.message);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }
});

// 知识搜索接口（关键词）
app.post('/api/list', async (req, res) => {
    if (!accessToken) {
        await getAccessToken();
    }

    const { key, kgBaseId, specialtyId, kgBaseName, tagId, tagName, sortField, sortRule, pageSize, page } = req.body;

    // 使用 form-urlencoded 格式
    const params = new URLSearchParams();
    params.append('method', 'list');
    if (key) params.append('key', key);
    if (kgBaseId) params.append('kgBaseId', kgBaseId);
    if (specialtyId) params.append('specialtyId', specialtyId);
    if (kgBaseName) params.append('kgBaseName', kgBaseName);
    if (tagId) params.append('tagId', tagId);
    if (tagName) params.append('tagName', tagName);
    if (sortField) params.append('sortField', sortField);
    if (sortRule) params.append('sortRule', sortRule);
    params.append('pageSize', pageSize || 10);
    params.append('page', page || 1);

    console.log('🔍 List search request:', params.toString());

    try {
        const response = await axios.post(`${API_BASE_URL_STANDARD}?token=${accessToken}`, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        res.json(response.data);
    } catch (error) {
        if (error.response && error.response.status === 401) {
            await refreshAccessToken();
            if (accessToken) {
                try {
                    const response = await axios.post(`${API_BASE_URL_STANDARD}?token=${accessToken}`, params, {
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    });
                    res.json(response.data);
                } catch (retryError) {
                    console.error('Retry error:', retryError.response ? retryError.response.data : retryError.message);
                    res.status(500).json({ success: false, message: 'Internal Server Error after retry' });
                }
            } else {
                res.status(500).json({ success: false, message: 'Failed to refresh token' });
            }
        } else {
            console.error('List error:', error.response ? error.response.data : error.message);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }
});

// 通用页面接口 - 生成页面URL
app.post('/api/page-url', async (req, res) => {
    const { pageName, kgBaseId, id, kgFields, contentId, muluId, catalogueId, originUrl } = req.body;

    if (!pageName) {
        return res.status(400).json({ success: false, message: 'pageName是必填项' });
    }

    const timestamp = Date.now();

    // 构建redirect_url
    let redirectUrl = 'https://inside.pmphai.com/gateway/cloud/pageapi/rest?';
    const redirectParams = new URLSearchParams();
    redirectParams.set('pageName', pageName);
    if (kgBaseId) redirectParams.set('kgBaseId', kgBaseId);
    if (id) redirectParams.set('id', id);
    if (kgFields) redirectParams.set('kgFields', kgFields);
    if (contentId) redirectParams.set('contentId', contentId);
    if (muluId) redirectParams.set('muluId', muluId);
    if (catalogueId) redirectParams.set('catalogueId', catalogueId);
    redirectUrl += redirectParams.toString();

    // 构建最终URL参数
    const finalOriginUrl = originUrl || 'https://www.pmphai.com';

    // URL编码后的参数（签名计算时需要使用编码后的值）
    const encodedRedirectUrl = encodeURIComponent(redirectUrl);
    const encodedOriginUrl = encodeURIComponent(finalOriginUrl);

    // 构建签名参数 - 需要包含所有请求参数（除sign外），URL参数使用编码后的值
    const signParams = {
        app_key: APPKEY,
        grant_type: 'page_token',
        origin_url: encodedOriginUrl,
        redirect_url: encodedRedirectUrl,
        timestamp: timestamp
    };

    // 按参数名首字母排序，用 & 连接
    const sortedKeys = Object.keys(signParams).sort();
    const param1 = sortedKeys.map(key => `${key}=${signParams[key]}`).join('&');

    // 加密字符串 = 参数1 + 云应用密钥 + 云应用app_key
    const signString = param1 + APP_SECRET + APPKEY;
    const sign = crypto.createHash('md5').update(signString).digest('hex');

    console.log('🔐 Sign params:', param1);
    console.log('🔐 Sign string:', signString);
    console.log('🔐 Generated sign:', sign);

    // 构建最终URL
    const authUrl = `https://inside.pmphai.com/aip/oauth/authorize?app_key=${APPKEY}&grant_type=page_token&timestamp=${timestamp}&sign=${sign}&redirect_url=${encodedRedirectUrl}&origin_url=${encodedOriginUrl}`;

    console.log('📄 Page URL generated:', authUrl);

    res.json({
        success: true,
        data: {
            url: authUrl,
            redirectUrl: redirectUrl,
            sign: sign,
            timestamp: timestamp
        }
    });
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    getAccessToken(); // Get token on startup
});
