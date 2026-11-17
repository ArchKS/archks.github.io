// ai coding: 扩展全评级实物书架，合并重读记录并支持评级筛选 2026/11/17: 08:59
(function () {
    'use strict';

    const script = document.currentScript;
    const assetBase = new URL('../img/bookshelf/', script.src);
    const STORAGE_KEY = 'READ-BOOKSHELF-VIEW';
    const SHELF_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18V3M3 11h18M3 20h18M6 5v6M9 4v7M12 6l2 5M16 5v6M6 14v6M9 14v6M12 16h6M12 19h6"/></svg>';
    const LIST_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>';
    // ai coding: 保存三档排列密度及对应控件，刷新后恢复上次选择 2026/11/17: 09:57
    let article, toggle, cabinet, controls, ratingControls, densityControls, rowsContainer, dialog, selectedButton;
    let records = [], groups = [], active = false, loading = null, layoutWidth = 0;
    const positions = { list: 0, shelf: 0 };
    const RATING_KEY = 'READ-BOOKSHELF-RATING';
    let ratingFilter = /^(all|[0-5])$/.test(readStorage(RATING_KEY)) ? readStorage(RATING_KEY) : 'all';
    const DENSITY_KEY = 'READ-BOOKSHELF-DENSITY';
    const DENSITIES = {
        loose: { label: '松散', standing: 2, standingGap: 3, angle: 11, gap: 24, mobileGap: 14 },
        normal: { label: '正常', standing: 4, standingGap: 2, angle: 7, gap: 8, mobileGap: 6 },
        compact: { label: '紧凑', gap: 0, mobileGap: 0 }
    };
    const storedDensity = readStorage(DENSITY_KEY);
    let density = Object.prototype.hasOwnProperty.call(DENSITIES, storedDensity) ? storedDensity : 'loose';

    function readStorage(key) {
        try { return localStorage.getItem(key); } catch (error) { return null; }
    }

    function writeStorage(key, value) {
        try { localStorage.setItem(key, String(value)); } catch (error) { /* 浏览器禁用存储时仍可切换视图。 */ }
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // ai coding: 统一书名作者匹配键，并读取隐藏单元格保存的原文而不改变显示状态 2026/11/17: 08:59
    function normalize(text) {
        return text.replace(/[\s《》'’：:·・•.,，、/（）()～~\-]/g, '').toLowerCase();
    }

    function bookKey(title, author) {
        const name = normalize(author);
        const canonical = name === 'kellymcgonigal' || name === '凯利麦格尼格尔' ? '凯利麦格尼格尔' : name;
        return normalize(title) + '|' + canonical;
    }

    function cellText(cell) {
        if (!cell) return '';
        const copy = cell.cloneNode(true);
        copy.querySelectorAll('.hide_star').forEach(function (node) {
            if (node.dataset.originalText) node.textContent = node.dataset.originalText;
        });
        return copy.textContent.trim();
    }

    // ai coding: 收集全部评级与未评级图书，合并同书重读记录并保留各次星级、日期和隐藏标记 2026/11/17: 08:59
    function collectBooks() {
        const result = new Map();
        article.querySelectorAll('table').forEach(function (table) {
            let heading = table.previousElementSibling;
            while (heading && heading.tagName !== 'H2') heading = heading.previousElementSibling;
            const year = heading && heading.textContent.match(/\d{4}/);
            if (!year) return;
            table.querySelectorAll('tbody tr').forEach(function (row) {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length < 8 || cellText(cells[3]).includes('⏯')) return;
                const quoted = cellText(cells[3]).match(/《(.*?)》/);
                if (!quoted) return;
                const title = quoted[1].trim();
                const reading = {
                    author: cellText(cells[2]), category: cellText(cells[1]),
                    rating: cellText(cells[4]), stars: (cellText(cells[4]).match(/★/g) || []).length,
                    year: year[0], date: cellText(cells[5]),
                    duration: cellText(cells[6]), words: cellText(cells[7])
                };
                const key = bookKey(title, reading.author);
                if (!result.has(key)) {
                    result.set(key, Object.assign({ title: title, key: key, readings: [], maxStars: 0,
                        isPrivate: Boolean(row.querySelector('.hide_star')) }, reading));
                }
                const book = result.get(key);
                book.readings.push(reading);
                book.maxStars = Math.max(book.maxStars, reading.stars);
                if (!book.words && reading.words) book.words = reading.words;
            });
        });
        return Array.from(result.values()).sort(function (a, b) { return b.maxStars - a.maxStars; });
    }

    // ai coding: 按各次阅读的评级筛选同一本书，解锁前不展示原书单的隐藏图书 2026/11/17: 08:59
    function visibleBooks() {
        const unlocked = document.body.classList.contains('show_star_img');
        return records.filter(function (book) {
            return (!book.isPrivate || unlocked) && (ratingFilter === 'all' || book.readings.some(function (reading) {
                return reading.stars === Number(ratingFilter);
            }));
        });
    }

    // ai coding: 重排时同步评级与排列选中状态，并保留当前可见图书集合 2026/11/17: 09:57
    function rebuildBooks() {
        if (!cabinet) return;
        cabinet.dataset.density = density;
        groups = createGroups();
        ratingControls.querySelectorAll('button').forEach(function (button) {
            button.setAttribute('aria-pressed', String(button.dataset.rating === ratingFilter));
        });
        densityControls.querySelectorAll('button').forEach(function (button) {
            button.setAttribute('aria-pressed', String(button.dataset.density === density));
        });
        layout();
    }

    // ai coding: 评级切换后按实际控件高度定位书柜，手机上首层不被吸顶控件遮挡 2026/11/17: 09:57
    function scrollToCabinet() {
        const offset = parseFloat(getComputedStyle(controls).top) + controls.offsetHeight + 20;
        window.scrollTo({ top: Math.max(0, cabinet.getBoundingClientRect().top + window.scrollY - offset), behavior: 'instant' });
    }

    // ai coding: 评级重排后使用统一定位，适配新增排列控件占用的高度 2026/11/17: 09:57
    function createRatingControls() {
        const controls = element('nav', 'shelf-rating-controls');
        controls.setAttribute('aria-label', '书籍评级');
        controls.hidden = true;
        ['all', '5', '4', '3', '2', '1', '0'].forEach(function (value) {
            if (value !== 'all' && !records.some(function (book) { return book.readings.some(function (reading) {
                return reading.stars === Number(value);
            }); })) return;
            const label = value === 'all' ? '全部' : value === '0' ? '未评级' : '★'.repeat(Number(value));
            const button = element('button', 'shelf-rating-choice', label);
            button.type = 'button';
            button.dataset.rating = value;
            button.setAttribute('aria-label', value === 'all' ? '全部书籍' : value === '0' ? '未评级书籍' : value + '星书籍');
            button.setAttribute('aria-pressed', String(value === ratingFilter));
            button.addEventListener('click', function () {
                if (ratingFilter === value) return;
                ratingFilter = value;
                writeStorage(RATING_KEY, value);
                rebuildBooks();
                scrollToCabinet();
            });
            controls.appendChild(button);
        });
        return controls;
    }

    // ai coding: 在评级旁直接切换三档排列并记住偏好，使用统一书柜定位 2026/11/17: 09:57
    function createDensityControls() {
        const nav = element('nav', 'shelf-density-controls');
        nav.setAttribute('aria-label', '书架排列');
        Object.keys(DENSITIES).forEach(function (value) {
            const button = element('button', 'shelf-density-choice', DENSITIES[value].label);
            button.type = 'button';
            button.dataset.density = value;
            button.setAttribute('aria-pressed', String(value === density));
            button.addEventListener('click', function () {
                if (density === value) return;
                density = value;
                writeStorage(DENSITY_KEY, value);
                rebuildBooks();
                scrollToCabinet();
            });
            nav.appendChild(button);
        });
        return nav;
    }

    function dimensions(book) {
        const seed = book.title.split('').reduce(function (sum, char) { return sum + char.charCodeAt(0); }, 0);
        const height = 164 + seed % 29;
        const ratio = book.meta ? book.meta.width / book.meta.height : 0.67;
        const width = Math.max(83, Math.min(128, Math.round(height * ratio)));
        const words = parseFloat(book.words) || 18;
        return { height: height, width: width, depth: Math.max(24, Math.min(38, Math.round(18 + words * 0.35))) };
    }

    function lettering(book, pose) {
        const label = element('span', 'spine-lettering');
        label.appendChild(element('span', 'spine-title', book.title));
        if (pose !== 'flat') label.appendChild(element('span', 'spine-author', book.author));
        return label;
    }

    function coverImage(book) {
        const image = element('img', 'book-cover-image');
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        if (book.meta) {
            image.src = new URL(book.meta.cover, assetBase).href;
            image.width = book.meta.width;
            image.height = book.meta.height;
        }
        image.addEventListener('error', function () {
            image.hidden = true;
            image.parentElement.classList.add('cover-missing');
        }, { once: true });
        return image;
    }

    // ai coding: 为混排书籍保留可访问名称与原书单的隐藏内容标记 2026/11/17: 08:59
    function makeBook(book, pose) {
        const size = dimensions(book);
        const button = element('button', 'shelf-book shelf-book--' + pose);
        button.type = 'button';
        button.setAttribute('aria-label', book.title + '，' + book.author);
        button.dataset.book = book.title;
        button.dataset.private = book.isPrivate ? '1' : '0';
        button.dataset.pose = pose;
        button.style.setProperty('--book-height', size.height + 'px');
        button.style.setProperty('--book-width', size.width + 'px');
        button.style.setProperty('--book-depth', size.depth + 'px');
        button.style.setProperty('--book-color', book.meta ? book.meta.color : '#74604b');
        button.style.setProperty('--book-ink', book.meta ? book.meta.ink : '#f3e9d5');
        if (pose === 'flat') {
            button.style.setProperty('--flat-length', size.height + 'px');
            button.style.setProperty('--flat-height', size.depth + 'px');
        }
        const object = element('span', 'book-object');
        if (pose === 'cover') {
            const front = element('span', 'book-cover');
            if (book.meta) front.appendChild(coverImage(book));
            else front.classList.add('cover-missing');
            front.appendChild(element('span', 'book-cover-fallback', book.title));
            object.appendChild(front);
        } else if (book.meta && book.meta.spine && pose === 'spine') {
            const image = element('img', 'book-real-spine');
            image.src = new URL(book.meta.spine, assetBase).href;
            image.alt = '';
            image.loading = 'lazy';
            image.addEventListener('error', function () {
                image.remove();
                object.appendChild(lettering(book, pose));
            }, { once: true });
            object.appendChild(image);
        } else {
            object.appendChild(lettering(book, pose));
        }
        if (pose === 'flat' && book.meta) {
            const top = element('span', 'flat-cover');
            top.style.backgroundImage = 'url("' + new URL(book.meta.cover, assetBase).href + '")';
            object.appendChild(top);
        }
        button.appendChild(object);
        button.addEventListener('click', function () { openBook(book, button); });
        return button;
    }

    // ai coding: 松散保持混排，正常增加直立书并缩小斜靠角度，紧凑逐册书脊朝外竖排 2026/11/17: 09:57
    function createGroups() {
        const arranged = visibleBooks();
        const settings = DENSITIES[density];
        if (density === 'compact') {
            return arranged.map(function (book) {
                const group = element('div', 'shelf-group');
                const width = dimensions(book).depth;
                group.style.width = width + 'px';
                group.appendChild(makeBook(book, 'spine'));
                return { node: group, width: width };
            });
        }
        let index = 0, cycle = 0;
        const result = [];
        while (index < arranged.length) {
            const front = arranged[index++];
            const cover = element('div', 'shelf-group');
            cover.appendChild(makeBook(front, 'cover'));
            result.push({ node: cover, width: dimensions(front).width + 8 });

            const standing = element('div', 'shelf-group shelf-group--standing');
            let standingWidth = 0;
            for (let count = 0; count < settings.standing && index < arranged.length; count++) {
                const book = arranged[index++];
                standing.appendChild(makeBook(book, 'spine'));
                standingWidth += dimensions(book).depth + (count ? settings.standingGap : 0);
            }
            if (standing.children.length) result.push({ node: standing, width: standingWidth });

            if (index + 1 < arranged.length) {
                const support = arranged[index++], leaning = arranged[index++];
                const pose = cycle % 2 ? 'cover' : 'spine';
                const size = dimensions(leaning);
                const radians = settings.angle * Math.PI / 180;
                const reach = Math.ceil(size.height * Math.sin(radians));
                const leanWidth = pose === 'cover' ? size.width : size.depth;
                const group = element('div', 'shelf-group shelf-group--lean');
                const supportBook = makeBook(support, 'spine');
                supportBook.style.setProperty('--book-height', Math.ceil(size.height * Math.cos(radians)) + 6 + 'px');
                group.appendChild(supportBook);
                const slot = element('span', 'shelf-lean-slot');
                slot.style.width = reach + leanWidth + 'px';
                slot.style.height = size.height + 'px';
                const leanBook = makeBook(leaning, pose);
                leanBook.dataset.pose = 'lean-' + pose;
                leanBook.style.setProperty('--lean-angle', '-' + settings.angle + 'deg');
                slot.appendChild(leanBook);
                group.appendChild(slot);
                result.push({ node: group, width: dimensions(support).depth + reach + leanWidth + 2 });
            }

            const stack = element('div', 'shelf-group shelf-group--stack');
            let stackWidth = 0;
            for (let count = 0; count < 3 && index < arranged.length; count++) {
                const book = arranged[index++];
                stack.appendChild(makeBook(book, 'flat'));
                stackWidth = Math.max(stackWidth, dimensions(book).height + 8 + (count % 2 ? 6 : 0));
            }
            if (stack.children.length) result.push({ node: stack, width: stackWidth });
            cycle++;
        }
        return result;
    }

    // ai coding: 按排列密度换层，紧凑模式填满完整层板，末层保留书籍实际厚度 2026/11/17: 09:57
    function layout() {
        if (!active || !cabinet || !cabinet.clientWidth) return;
        const inset = window.innerWidth <= 360 ? 28 : 36;
        const available = rowsContainer.clientWidth - inset;
        const settings = DENSITIES[density];
        const gap = window.innerWidth <= 600 ? settings.mobileGap : settings.gap;
        cabinet.style.setProperty('--shelf-gap', gap + 'px');
        const fragment = document.createDocumentFragment();
        let row, used = 0;
        groups.forEach(function (group) {
            if (!row || used + (used ? gap : 0) + group.width > available) {
                if (row && density === 'compact') row.classList.add('shelf-items--filled');
                const cavity = element('div', 'shelf-cavity');
                row = element('div', 'shelf-items');
                cavity.appendChild(row);
                fragment.appendChild(cavity);
                used = 0;
            }
            row.appendChild(group.node);
            used += group.width + (used ? gap : 0);
        });
        rowsContainer.replaceChildren(fragment);
        layoutWidth = cabinet.clientWidth;
    }

    // ai coding: 关联封面后统一接入评级与排列控件，并恢复所选密度 2026/11/17: 09:57
    async function ensureCabinet() {
        if (cabinet) return;
        if (loading) return loading;
        loading = (async function () {
            let data = [];
            try {
                const response = await fetch(new URL('books.json', assetBase));
                if (response.ok) data = await response.json();
            } catch (error) { console.warn('书架封面资源暂不可用，将使用书名书脊。', error); }
            const metadata = new Map(), titles = new Map();
            (Array.isArray(data) ? data : []).forEach(function (item) {
                if (item.author) metadata.set(bookKey(item.title, item.author), item);
                const title = normalize(item.title);
                titles.set(title, titles.has(title) ? null : item);
            });
            records.forEach(function (book) { book.meta = metadata.get(book.key) || titles.get(normalize(book.title)); });
            cabinet = element('section', 'read-bookshelf');
            cabinet.setAttribute('aria-label', '书架');
            cabinet.hidden = true;
            cabinet.dataset.density = density;
            cabinet.appendChild(element('div', 'shelf-crown'));
            rowsContainer = element('div', 'shelf-rows');
            cabinet.appendChild(rowsContainer);
            cabinet.appendChild(element('div', 'shelf-plinth'));
            ratingControls = createRatingControls();
            ratingControls.hidden = false;
            densityControls = createDensityControls();
            controls = element('div', 'shelf-controls');
            controls.hidden = true;
            controls.append(ratingControls, densityControls);
            article.before(controls, cabinet);
            groups = createGroups();
            const observer = new ResizeObserver(function () {
                if (active && Math.abs(cabinet.clientWidth - layoutWidth) > 1) layout();
            });
            observer.observe(cabinet);
        })();
        return loading;
    }

    // ai coding: 点击取出书籍后在同一弹层展示封面与阅读记录，支持键盘关闭和焦点恢复 2026/11/16: 17:30
    function createDialog() {
        if (dialog) return;
        dialog = element('dialog', 'shelf-book-dialog');
        dialog.setAttribute('aria-labelledby', 'shelf-dialog-title');
        document.body.appendChild(dialog);
        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) dialog.close();
        });
        dialog.addEventListener('close', function () {
            document.body.classList.remove('shelf-book-open');
            if (selectedButton) {
                selectedButton.classList.remove('is-taken');
                if (selectedButton.isConnected) selectedButton.focus({ preventScroll: true });
            }
            selectedButton = null;
        });
    }

    // ai coding: 将书单中的小时分钟数转换为可直接阅读的时长 2026/11/16: 17:36
    function formatDuration(value) {
        const parts = value.match(/^(\d+):(\d+)$/);
        if (!parts) return value;
        return (Number(parts[1]) ? Number(parts[1]) + '小时' : '') +
            (Number(parts[2]) ? Number(parts[2]) + '分钟' : '') || '0分钟';
    }

    // ai coding: 展示当前评级对应的各次阅读记录，重读书籍保留原始星级和日期 2026/11/17: 08:59
    function openBook(book, button) {
        createDialog();
        const paper = element('div', 'shelf-book-paper');
        const close = element('button', 'shelf-dialog-close', '×');
        close.type = 'button';
        close.setAttribute('aria-label', '收回书籍');
        close.addEventListener('click', function () { dialog.close(); });
        paper.appendChild(close);
        const cover = element('div', 'shelf-dialog-cover');
        if (book.meta) cover.appendChild(coverImage(book));
        else cover.classList.add('cover-missing');
        cover.appendChild(element('span', 'book-cover-fallback', book.title));
        paper.appendChild(cover);
        const detail = element('div', 'shelf-book-detail');
        const title = element('h2', '', book.title);
        title.id = 'shelf-dialog-title';
        detail.appendChild(title);
        const readings = ratingFilter === 'all' ? book.readings : book.readings.filter(function (reading) {
            return reading.stars === Number(ratingFilter);
        });
        detail.appendChild(element('p', 'shelf-detail-author', readings[0].author));
        readings.forEach(function (reading) {
            const record = element('section', 'shelf-reading-record');
            record.appendChild(element('p', readings.length > 1 ? 'shelf-reading-heading' : 'shelf-detail-rating',
                (readings.length > 1 ? reading.year + ' · ' : '') + (reading.rating || '未评级')));
            const facts = element('dl', 'shelf-detail-facts');
            const values = [['年份', readings.length === 1 ? reading.year : ''], ['分类', reading.category],
                ['阅读日期', reading.date], ['阅读时长', formatDuration(reading.duration)],
                ['字数', reading.words ? reading.words + ' 万字' : '']];
            values.forEach(function (fact) {
                if (!fact[1]) return;
                facts.appendChild(element('dt', '', fact[0]));
                facts.appendChild(element('dd', '', fact[1]));
            });
            record.appendChild(facts);
            detail.appendChild(record);
        });
        paper.appendChild(detail);
        dialog.replaceChildren(paper);
        selectedButton = button;
        button.classList.add('is-taken');
        document.body.classList.add('shelf-book-open');
        dialog.showModal();
        close.focus({ preventScroll: true });
    }

    // ai coding: 切换书架时同步评级和排列控件显隐，保留原书单及滚动位置 2026/11/17: 09:57
    async function setView(showShelf, restorePosition) {
        toggle.disabled = true;
        toggle.setAttribute('aria-busy', 'true');
        try {
            if (showShelf) await ensureCabinet();
            positions[active ? 'shelf' : 'list'] = window.scrollY;
            active = showShelf;
            if (dialog && dialog.open) dialog.close();
            document.documentElement.classList.toggle('bookshelf-view', active);
            article.hidden = active;
            if (cabinet) cabinet.hidden = !active;
            if (controls) controls.hidden = !active;
            toggle.setAttribute('aria-pressed', String(active));
            toggle.setAttribute('aria-label', active ? '切换到书单' : '切换到书架');
            toggle.innerHTML = active ? LIST_ICON : SHELF_ICON;
            writeStorage(STORAGE_KEY, active ? '1' : '0');
            requestAnimationFrame(function () {
                layout();
                if (restorePosition) window.scrollTo({ top: positions[active ? 'shelf' : 'list'], behavior: 'instant' });
            });
        } finally {
            toggle.disabled = false;
            toggle.removeAttribute('aria-busy');
        }
    }

    // ai coding: 随眼睛按钮的解锁状态更新书架，锁定时收回隐藏书籍 2026/11/17: 08:59
    function init() {
        if (location.pathname.replace(/\/+$/, '') !== '/Read') return;
        article = document.querySelector('.article-content');
        toggle = document.querySelector('.tool-bookshelf-toggle');
        if (!article || !toggle) return;
        records = collectBooks();
        if (!records.length) return;
        toggle.hidden = false;
        toggle.addEventListener('click', function () { setView(!active, true); });
        let unlocked = document.body.classList.contains('show_star_img');
        new MutationObserver(function () {
            const next = document.body.classList.contains('show_star_img');
            if (next === unlocked) return;
            unlocked = next;
            if (dialog && dialog.open) dialog.close();
            rebuildBooks();
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        if (readStorage(STORAGE_KEY) === '1') setView(true, false);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
