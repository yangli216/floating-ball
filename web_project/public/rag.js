document.addEventListener('DOMContentLoaded', () => {
    // ==================== Vector Search (AI Knowledge) ====================
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const loading = document.getElementById('loading');
    const resultsContainer = document.getElementById('results-container');
    const resultCount = document.getElementById('result-count');
    const clipContainer = document.getElementById('clip-container');
    const clipLoading = document.getElementById('clip-loading');

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            searchButton.click();
        }
    });

    searchButton.addEventListener('click', async () => {
        const query = searchInput.value.trim();
        if (!query) {
            showToast('请输入搜索内容');
            return;
        }

        const searchParams = {
            query: query,
            type: parseInt(document.getElementById('search-type').value),
            limit: parseInt(document.getElementById('limit').value),
            score: parseFloat(document.getElementById('score').value),
            enableAbstract: document.getElementById('enable-abstract').checked
        };

        loading.classList.remove('hidden');
        resultsContainer.innerHTML = '';
        resultCount.textContent = '';
        clipContainer.innerHTML = '<div class="placeholder-text"><p>👈 点击左侧检索结果查看原文</p></div>';
        searchButton.disabled = true;

        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(searchParams),
            });

            const data = await response.json();

            if (data.success) {
                displayVectorResults(data.data);
                resultCount.textContent = `找到 ${data.data?.length || 0} 条结果`;
            } else {
                resultsContainer.innerHTML = `<div class="error">错误: ${data.message}</div>`;
            }
        } catch (error) {
            resultsContainer.innerHTML = `<div class="error">网络错误: ${error.message}</div>`;
        } finally {
            loading.classList.add('hidden');
            searchButton.disabled = false;
        }
    });

    function displayVectorResults(results) {
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">未找到相关结果</div>';
            return;
        }

        let html = '';
        results.forEach((result, index) => {
            html += `
                <div class="result-item" data-id="${escapeHtml(result.id)}">
                    <div class="result-item-header">
                        <span class="result-item-num">${index + 1}</span>
                        <h4 class="result-item-title">${escapeHtml(result.name || '未命名')}</h4>
                        ${result.score ? `<span class="score-badge">${result.score.toFixed(2)}</span>` : ''}
                    </div>
                    <div class="result-item-content">${escapeHtml(result.content || '无内容')}</div>
                    <div class="result-item-meta">
                        ${result.words ? `<span>字数: ${result.words}</span>` : ''}
                        ${result.sourceInfo?.knowledgeLibName ? `<span>${escapeHtml(result.sourceInfo.knowledgeLibName)}</span>` : ''}
                        ${result.resourcePos ? `<span>${escapeHtml(result.resourcePos)}</span>` : ''}
                    </div>
                    ${result.aiAbstract ? `<div class="ai-abstract"><strong>AI摘要:</strong> ${escapeHtml(result.aiAbstract)}</div>` : ''}
                </div>
            `;
        });

        resultsContainer.innerHTML = html;

        document.querySelectorAll('.result-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.result-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                getClipContent(item.dataset.id);
            });
        });
    }

    async function getClipContent(id) {
        clipContainer.innerHTML = '';
        clipLoading.classList.remove('hidden');

        try {
            const response = await fetch('/api/clip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id }),
            });

            const data = await response.json();

            if (data.success && data.data) {
                const clipData = data.data;
                clipContainer.innerHTML = `
                    <div class="clip-detail">
                        ${clipData.sourceInfo ? `
                            <div class="source-info">
                                <strong>知识库:</strong> ${escapeHtml(clipData.sourceInfo.knowledgeLibName || '未知')}
                                (ID: ${escapeHtml(clipData.sourceInfo.knowledgeLibId || '未知')})
                                ${clipData.sourceInfo.publishYear ? ` | 发布: ${clipData.sourceInfo.publishYear}` : ''}
                            </div>
                        ` : ''}
                        <div class="xml-content">${clipData.xml || '暂无原文内容'}</div>
                    </div>
                `;
            } else {
                clipContainer.innerHTML = `<div class="error">无法加载: ${data.message || '未知错误'}</div>`;
            }
        } catch (error) {
            clipContainer.innerHTML = `<div class="error">网络错误: ${error.message}</div>`;
        } finally {
            clipLoading.classList.add('hidden');
        }
    }

    // ==================== Utility Functions ====================
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    function showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }
});
