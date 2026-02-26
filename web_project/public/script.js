document.addEventListener('DOMContentLoaded', () => {
    // ==================== Global State ====================
    let currentKgBaseId = null;
    let currentKgBaseName = null;
    let currentPage = 0;
    let currentPageSize = 10;
    let currentSearchKey = '';

    // ==================== Category Name Mapping (参照原网站分类) ====================
    const categoryNameMap = {
        'lc': '临床全科库',
        'yy': '用药知识库',
        'zy': '中医知识库',
        'zk': '临床专科库',
        'jkkp': '健康科普',
        'tsk': '特色库'
    };

    // 分类显示顺序
    const categoryOrder = ['lc', 'zk', 'yy', 'zy', 'jkkp', 'tsk'];

    // ==================== Load Knowledge Bases on Startup ====================
    loadKgBases();

    // ==================== Knowledge Base Loading ====================
    async function loadKgBases() {
        const loadingOverlay = document.getElementById('loading-overlay');
        const kgbasesContent = document.getElementById('kgbases-content');
        const searchScope = document.getElementById('search-scope');

        loadingOverlay.classList.remove('hidden');

        try {
            const response = await fetch('/api/kgbases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });

            const data = await response.json();

            if (data.success) {
                displayKgBasesAsCards(data.data);
                populateSearchScope(data.data, searchScope);
            } else {
                kgbasesContent.innerHTML = `<div class="error">加载失败: ${data.message}</div>`;
            }
        } catch (error) {
            kgbasesContent.innerHTML = `<div class="error">网络错误: ${error.message}</div>`;
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    }

    function displayKgBasesAsCards(data) {
        const container = document.getElementById('kgbases-content');

        if (!data || Object.keys(data).length === 0) {
            container.innerHTML = '<div class="no-results">未获取到知识库列表</div>';
            return;
        }

        let html = '';

        // 按照定义的顺序显示分类
        const sortedCategories = Object.keys(data).sort((a, b) => {
            const indexA = categoryOrder.indexOf(a);
            const indexB = categoryOrder.indexOf(b);
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        for (const category of sortedCategories) {
            const bases = data[category];
            if (Array.isArray(bases) && bases.length > 0) {
                const categoryDisplayName = categoryNameMap[category] || category;

                // 计算该分类下的总知识数
                const totalKgNum = bases.reduce((sum, base) => sum + (base.kgNum || 0), 0);

                html += `
                    <div class="kb-category">
                        <div class="kb-category-header">
                            <h2 class="kb-category-title">${escapeHtml(categoryDisplayName)}</h2>
                            <span class="kb-category-count">${bases.length}个知识库 · ${totalKgNum.toLocaleString()}条知识</span>
                        </div>
                        <div class="kb-cards-grid">
                `;

                bases.forEach(base => {
                    const displayName = base.displayName || base.kgBaseName || '未命名';
                    const kgNum = base.kgNum || 0;
                    const updateDate = base.maxReleaseDate || '';
                    // 清理描述中的HTML标签
                    const descText = base.kgBaseDesc ? base.kgBaseDesc.replace(/<[^>]*>/g, '').trim() : '';

                    html += `
                        <div class="kb-card" data-id="${escapeHtml(base.id)}" data-name="${escapeHtml(displayName)}">
                            <div class="kb-card-content">
                                <h3 class="kb-card-title">${escapeHtml(displayName)}</h3>
                                <div class="kb-card-meta">
                                    <span class="kb-card-count">${kgNum.toLocaleString()} 条</span>
                                    ${updateDate ? `<span class="kb-card-date">更新: ${updateDate}</span>` : ''}
                                </div>
                                ${descText ? `<p class="kb-card-desc">${escapeHtml(descText.substring(0, 80))}${descText.length > 80 ? '...' : ''}</p>` : ''}
                            </div>
                            <div class="kb-card-arrow">›</div>
                        </div>
                    `;
                });

                html += `
                        </div>
                    </div>
                `;
            }
        }

        container.innerHTML = html;

        // Add click handlers to cards
        document.querySelectorAll('.kb-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                const name = card.dataset.name;
                openKnowledgeModal(id, name);
            });
        });
    }

    function populateSearchScope(data, selectElement) {
        selectElement.innerHTML = '<option value="">全部</option>';

        // 按照定义的顺序显示分类
        const sortedCategories = Object.keys(data).sort((a, b) => {
            const indexA = categoryOrder.indexOf(a);
            const indexB = categoryOrder.indexOf(b);
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        for (const category of sortedCategories) {
            const bases = data[category];
            if (Array.isArray(bases) && bases.length > 0) {
                const categoryDisplayName = categoryNameMap[category] || category;

                // 创建分类 optgroup
                const optgroup = document.createElement('optgroup');
                optgroup.label = categoryDisplayName;

                bases.forEach(base => {
                    const option = document.createElement('option');
                    option.value = base.id;
                    option.textContent = base.displayName || base.kgBaseName || '未命名';
                    optgroup.appendChild(option);
                });

                selectElement.appendChild(optgroup);
            }
        }
    }

    // ==================== Knowledge Modal ====================
    function openKnowledgeModal(kgBaseId, kgBaseName, searchKey = '') {
        currentKgBaseId = kgBaseId;
        currentKgBaseName = kgBaseName;
        currentPage = 0;
        currentSearchKey = searchKey;

        const modal = document.getElementById('knowledge-modal');
        const modalTitle = document.getElementById('modal-title');
        const modalSearchInput = document.getElementById('modal-search-input');

        modalTitle.textContent = kgBaseName;
        modalSearchInput.value = searchKey;
        modal.classList.remove('hidden');

        // Load categories for this knowledge base
        loadCategories(kgBaseId);

        // Load knowledge list
        loadKnowledgeList();
    }

    window.closeModal = function() {
        document.getElementById('knowledge-modal').classList.add('hidden');
    };

    // ==================== Category Loading ====================
    async function loadCategories(kgBaseId) {
        const categoryTree = document.getElementById('category-tree');
        categoryTree.innerHTML = '<p class="loading">加载分类中...</p>';

        try {
            const response = await fetch('/api/tag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kgBaseId }),
            });

            const data = await response.json();

            if (data.success && data.data) {
                displayCategoryTree(data.data);
            } else {
                categoryTree.innerHTML = '<p class="hint">暂无分类信息</p>';
            }
        } catch (error) {
            categoryTree.innerHTML = '<p class="error">加载失败</p>';
        }
    }

    function displayCategoryTree(tags) {
        const container = document.getElementById('category-tree');

        if (!tags || tags.length === 0) {
            container.innerHTML = '<p class="hint">暂无分类信息</p>';
            return;
        }

        // 检查是否有多个维度（通过检查顶层节点的结构）
        const hasDimensions = tags.length > 1 && tags.every(t => t.child && t.child.length > 0);

        function renderTreeItem(item, level = 0) {
            const hasChildren = item.child && Array.isArray(item.child) && item.child.length > 0;
            const indent = level * 12;

            let html = `
                <div class="tree-item ${hasChildren ? 'has-children' : ''}"
                     style="padding-left: ${indent}px"
                     data-tag-id="${escapeHtml(item.id)}">
                    ${hasChildren ? '<span class="tree-toggle">▼</span>' : '<span style="width:16px"></span>'}
                    <span class="tree-icon">${hasChildren ? '📁' : '📄'}</span>
                    <span class="tree-label">${escapeHtml(item.name)}</span>
                </div>
            `;

            if (hasChildren) {
                html += `<div class="tree-children">`;
                item.child.forEach(child => {
                    html += renderTreeItem(child, level + 1);
                });
                html += `</div>`;
            }

            return html;
        }

        function renderDimension(dimension, index) {
            const childCount = dimension.child ? dimension.child.length : 0;
            return `
                <div class="tree-dimension ${index > 0 ? 'collapsed' : ''}">
                    <div class="tree-dimension-header">
                        <span class="tree-dimension-toggle">▼</span>
                        <span>${escapeHtml(dimension.name)}</span>
                        <span class="tree-count">${childCount}</span>
                    </div>
                    <div class="tree-dimension-content">
                        ${dimension.child ? dimension.child.map(item => renderTreeItem(item, 0)).join('') : ''}
                    </div>
                </div>
            `;
        }

        let html = '';
        if (hasDimensions) {
            // 多维度模式：每个顶层作为一个可折叠的维度
            tags.forEach((dimension, index) => {
                html += renderDimension(dimension, index);
            });
        } else {
            // 单维度模式：直接渲染树
            tags.forEach(item => {
                html += renderTreeItem(item, 0);
            });
        }

        container.innerHTML = html;

        // 维度标题点击事件（展开/折叠）
        container.querySelectorAll('.tree-dimension-header').forEach(header => {
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                const dimension = header.parentElement;
                dimension.classList.toggle('collapsed');
            });
        });

        // 有子节点的项点击事件（展开/折叠）
        container.querySelectorAll('.tree-item.has-children').forEach(item => {
            const toggle = item.querySelector('.tree-toggle');
            if (toggle) {
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    item.classList.toggle('collapsed');
                });
            }
        });

        // 所有树项的点击事件（选中并加载列表）
        container.querySelectorAll('.tree-item').forEach(item => {
            item.addEventListener('click', () => {
                container.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                const tagId = item.dataset.tagId;
                currentPage = 0;
                loadKnowledgeList(tagId);
            });
        });
    }

    // ==================== Knowledge List Loading ====================
    async function loadKnowledgeList(tagId = null) {
        const modalLoading = document.getElementById('modal-loading');
        const knowledgeList = document.getElementById('knowledge-list');
        const pagination = document.getElementById('pagination');

        modalLoading.classList.remove('hidden');
        knowledgeList.innerHTML = '';
        pagination.innerHTML = '';

        const requestBody = {
            kgBaseId: currentKgBaseId,
            pageSize: currentPageSize,
            page: currentPage
        };

        if (currentSearchKey) {
            requestBody.key = currentSearchKey;
        }
        if (tagId) {
            requestBody.tagId = tagId;
        }

        console.log('📤 loadKnowledgeList - currentSearchKey:', currentSearchKey, 'requestBody:', requestBody);

        try {
            const response = await fetch('/api/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            const data = await response.json();

            if (data.success && data.data) {
                displayKnowledgeList(data.data);
            } else {
                knowledgeList.innerHTML = `<div class="no-results">未找到相关结果</div>`;
            }
        } catch (error) {
            knowledgeList.innerHTML = `<div class="error">网络错误: ${error.message}</div>`;
        } finally {
            modalLoading.classList.add('hidden');
        }
    }

    function displayKnowledgeList(data) {
        const container = document.getElementById('knowledge-list');
        const pagination = document.getElementById('pagination');

        if (!data.rows || data.rows.length === 0) {
            container.innerHTML = '<div class="no-results">未找到相关知识</div>';
            return;
        }

        let html = '';
        data.rows.forEach((row, index) => {
            const itemNum = (currentPage - 1) * currentPageSize + index + 1;
            html += `
                <div class="knowledge-item" data-id="${escapeHtml(row.id)}" data-kgbase-id="${escapeHtml(currentKgBaseId)}">
                    <div class="knowledge-item-header">
                        <span class="knowledge-item-num">${itemNum}</span>
                        <h4 class="knowledge-item-title">${escapeHtml(row.name || '未命名')}</h4>
                    </div>
                    <div class="knowledge-item-meta">
                        <span>${escapeHtml(row.kgBaseDisplayName || row.kgBaseName || '')}</span>
                        ${row.updateTime ? `<span>${row.updateTime}</span>` : ''}
                    </div>
                    ${row.tagNames && row.tagNames.length > 0 ? `
                        <div class="knowledge-item-tags">
                            ${row.tagNames.map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        });

        container.innerHTML = html;

        // Pagination
        const totalPages = data.totalPage || 1;
        let paginationHtml = `<span class="pagination-info">共 ${data.totalRows} 条，第 ${data.page + 1}/${totalPages} 页</span>`;

        if (totalPages > 1) {
            paginationHtml += '<div class="pagination-buttons">';
            if (currentPage > 1) {
                paginationHtml += `<button class="pagination-btn" data-page="${currentPage - 1}">上一页</button>`;
            }
            if (currentPage < totalPages) {
                paginationHtml += `<button class="pagination-btn" data-page="${currentPage + 1}">下一页</button>`;
            }
            paginationHtml += '</div>';
        }

        pagination.innerHTML = paginationHtml;

        // Add click handlers
        container.querySelectorAll('.knowledge-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                const kgBaseId = item.dataset.kgbaseId;
                openDetailModal(id, kgBaseId);
            });
        });

        pagination.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPage = parseInt(btn.dataset.page);
                loadKnowledgeList();
            });
        });
    }

    // ==================== Detail Modal ====================
    async function openDetailModal(id, kgBaseId) {
        const modal = document.getElementById('detail-modal');
        const detailTitle = document.getElementById('detail-title');
        const detailLoading = document.getElementById('detail-loading');
        const detailContent = document.getElementById('detail-content');

        modal.classList.remove('hidden');
        detailLoading.classList.remove('hidden');
        detailContent.innerHTML = '';
        detailTitle.textContent = '加载中...';

        // Store for openInPage
        window.currentDetailId = id;
        window.currentDetailKgBaseId = kgBaseId;

        try {
            const response = await fetch('/api/page-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageName: 'detail',
                    id: id,
                    kgBaseId: kgBaseId
                }),
            });

            const data = await response.json();

            if (data.success) {
                detailTitle.textContent = '知识详情';
                detailContent.innerHTML = `
                    <div class="detail-preview">
                        <iframe src="${escapeHtml(data.data.url)}" frameborder="0" class="detail-iframe"></iframe>
                    </div>
                `;
            } else {
                detailContent.innerHTML = `<div class="error">加载失败: ${data.message}</div>`;
            }
        } catch (error) {
            detailContent.innerHTML = `<div class="error">网络错误: ${error.message}</div>`;
        } finally {
            detailLoading.classList.add('hidden');
        }
    }

    window.closeDetailModal = function() {
        document.getElementById('detail-modal').classList.add('hidden');
    };

    window.openInPage = async function() {
        try {
            const response = await fetch('/api/page-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageName: 'detail',
                    id: window.currentDetailId,
                    kgBaseId: window.currentDetailKgBaseId
                }),
            });

            const data = await response.json();
            if (data.success) {
                window.open(data.data.url, '_blank');
            }
        } catch (error) {
            showToast('打开失败');
        }
    };

    // ==================== Modal Search ====================
    const modalSearchBtn = document.getElementById('modal-search-btn');
    const modalSearchInput = document.getElementById('modal-search-input');

    console.log('🔧 Modal search button bound:', modalSearchBtn);
    console.log('🔧 Modal search input bound:', modalSearchInput);

    if (modalSearchBtn) {
        modalSearchBtn.addEventListener('click', () => {
            const inputValue = modalSearchInput.value.trim();
            currentSearchKey = inputValue;
            console.log('🔍 Modal search clicked, input value:', inputValue, 'currentSearchKey:', currentSearchKey);
            currentPage = 0;
            loadKnowledgeList();
        });
    } else {
        console.error('❌ Modal search button not found!');
    }

    modalSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            modalSearchBtn.click();
        }
    });

    // ==================== Global Search ====================
    const globalSearchBtn = document.getElementById('global-search-btn');
    const globalSearchInput = document.getElementById('global-search');
    const searchScope = document.getElementById('search-scope');

    globalSearchBtn.addEventListener('click', () => {
        const query = globalSearchInput.value.trim();
        const kgBaseId = searchScope.value;

        if (!query) {
            showToast('请输入搜索关键词');
            return;
        }

        if (kgBaseId) {
            // Search within specific knowledge base
            const selectedOption = searchScope.options[searchScope.selectedIndex];
            openKnowledgeModal(kgBaseId, selectedOption.textContent, query);
            loadKnowledgeList();
        } else {
            // Global search - open modal with results
            performGlobalSearch(query);
        }
    });

    globalSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            globalSearchBtn.click();
        }
    });

    async function performGlobalSearch(query) {
        currentKgBaseId = null;
        currentKgBaseName = '全局搜索';
        currentPage = 0;
        currentSearchKey = query;

        const modal = document.getElementById('knowledge-modal');
        const modalTitle = document.getElementById('modal-title');
        const modalSearchInput = document.getElementById('modal-search-input');
        const categoryTree = document.getElementById('category-tree');

        modalTitle.textContent = `搜索结果: ${query}`;
        modalSearchInput.value = query;
        categoryTree.innerHTML = '<p class="hint">全局搜索模式</p>';
        modal.classList.remove('hidden');

        const modalLoading = document.getElementById('modal-loading');
        const knowledgeList = document.getElementById('knowledge-list');
        const pagination = document.getElementById('pagination');

        modalLoading.classList.remove('hidden');
        knowledgeList.innerHTML = '';
        pagination.innerHTML = '';

        try {
            const response = await fetch('/api/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key: query,
                    pageSize: currentPageSize,
                    page: currentPage
                }),
            });

            const data = await response.json();

            if (data.success && data.data) {
                displayKnowledgeList(data.data);
            } else {
                knowledgeList.innerHTML = `<div class="no-results">未找到相关结果</div>`;
            }
        } catch (error) {
            knowledgeList.innerHTML = `<div class="error">网络错误: ${error.message}</div>`;
        } finally {
            modalLoading.classList.add('hidden');
        }
    }

    // ==================== Close modal on overlay click ====================
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    });

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
