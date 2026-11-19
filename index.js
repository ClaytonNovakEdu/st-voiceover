(function () {
    'use strict';

    // Emergency URL bypass: add ?vo=off to your SillyTavern URL to disable if ever needed
    if (window.location.search.includes('vo=off')) {
        console.log('ST VoiceOver Booster disabled via URL parameter.');
        return;
    }

    const DEFAULT_VISIBLE_MESSAGES = 6;
    const STARTUP_SETTLE_DELAY_MS = 1500;

    const CHAT_ACTION_SELECTOR = [
        '#chat .mes_edit',
        '#chat .mes_edit_done',
        '#chat .mes_edit_cancel',
        '#chat .mes_edit_delete',
        '#chat .mes_edit_copy',
        '#chat .mes_button',
        '#chat .extraMesButtonsHint',
        '#chat .extraMesButtons > div',
        '#chat .swipe_left',
        '#chat .swipe_right'
    ].join(', ');

    let extensionStarted = false;
    let stAppReadyFired = false;

    let visibleMessageLimit = DEFAULT_VISIBLE_MESSAGES;
    let lastRenderedHidden = -1;
    let lastRenderedLimit = -1;
    let currentFirstMesNode = null;

    let activePrimaryOverlay = null;
    let lastTriggerElement = null;
    let wasGenerating = false;

    let layerRafId = null;
    let postAnimLayerTimer = null;
    let openPanelTimer = null;
    let chatLimiterTimer = null;
    let announceTimer = null;

    // 1. Spoken names for top-bar drawer menus
    const DRAWER_LABELS = {
        'ai-config-button': 'AI Response Sliders and Presets',
        'sys-settings-button': 'API Connections',
        'advanced-formatting-button': 'AI Response Formatting',
        'WI-SP-button': 'World Info and Lorebooks',
        'user-settings-button': 'User Settings',
        'logo_block': 'Backgrounds',
        'extensions-settings-button': 'Extensions',
        'persona-management-button': 'Persona Management',
        'rightNavHolder': 'Character Management'
    };

    // 2. Spoken names for specific SillyTavern control IDs
    const ID_LABELS = {
        'send_but': 'Send Message',
        'send_textarea': 'Message Input',
        'options_button': 'Chat Actions Menu',
        'extensionsMenuButton': 'Extensions Quick Menu',
        'mes_stop': 'Stop Generating Response',
        'back_to_characters': 'Back to Character List',
        'create_button': 'Create New Character',
        'delete_button': 'Delete Character',
        'duplicate_button': 'Duplicate Character',
        'export_button': 'Export Character',
        'character_import_button': 'Import Character',
        'external_import_button': 'Import Character from URL',
        'favorite_button': 'Favorite Character',
        'rename_button': 'Rename Character',
        'convert_to_persona': 'Convert Character to Persona',
        'character_open_media_overrides': 'Character Media Overrides',
        'char-management-dropdown': 'Character List Tools',
        'option_start_new_chat': 'Start New Chat',
        'option_select_chat': 'Switch or Manage Saved Chats',
        'option_toggle_AN': 'Author Note',
        'option_toggle_CFG': 'Guidance Scale Panel',
        'option_delete_mes': 'Delete Messages',
        'option_regenerate': 'Regenerate Last Response',
        'option_impersonate': 'Impersonate: Have AI Write for You',
        'option_continue': 'Continue Generating Message',
        'option_close_chat': 'Close Current Chat',
        'update_preset': 'Save and Update Current Preset',
        'new_preset': 'Save as New Preset',
        'import_preset': 'Import Preset',
        'export_preset': 'Export Preset',
        'delete_preset': 'Delete Current Preset',
        'restore_default_preset': 'Restore Default Preset',
        'world_popup_new': 'Add New Lorebook Entry',
        'world_create_button': 'Create New Lorebook',
        'world_import_button': 'Import Lorebook',
        'world_export_button': 'Export Current Lorebook',
        'world_duplicate_button': 'Duplicate Current Lorebook',
        'world_rename_button': 'Rename Current Lorebook',
        'world_delete_button': 'Delete Current Lorebook',
        'floatingPromptClose': 'Close Author Note and Return to Chat',
        'cfgClose': 'Close Guidance Scale Panel'
    };

    // 3. Spoken fallbacks for icon-only FontAwesome buttons
    const ICON_LABELS = [
        ['fa-paper-plane', 'Send Message'],
        ['fa-bars', 'Options Menu'],
        ['fa-magic', 'Extensions Quick Menu'],
        ['fa-wand-magic-sparkles', 'Extensions Quick Menu'],
        ['fa-sliders', 'Sliders and Presets'],
        ['fa-plug', 'API Connections'],
        ['fa-book-atlas', 'World Info and Lorebooks'],
        ['fa-book', 'World Info'],
        ['fa-face-smile', 'Persona Management'],
        ['fa-user-cog', 'User Settings'],
        ['fa-cog', 'Settings'],
        ['fa-gear', 'Settings'],
        ['fa-image', 'Backgrounds'],
        ['fa-cubes', 'Extensions'],
        ['fa-id-card', 'Character Management'],
        ['fa-address-card', 'Character Management'],
        ['fa-code-branch', 'Update or Switch Branch'],
        ['fa-thumbtack', 'Pin'],
        ['fa-trash-can', 'Delete'],
        ['fa-trash', 'Delete'],
        ['fa-pen-to-square', 'Edit'],
        ['fa-pencil', 'Edit'],
        ['fa-pen', 'Edit or Rename'],
        ['fa-copy', 'Copy or Duplicate'],
        ['fa-clone', 'Duplicate'],
        ['fa-file-export', 'Export'],
        ['fa-download', 'Download'],
        ['fa-file-import', 'Import'],
        ['fa-upload', 'Upload'],
        ['fa-cloud-arrow-up', 'Upload'],
        ['fa-file-arrow-up', 'Import File'],
        ['fa-file-arrow-down', 'Export File'],
        ['fa-plus', 'Add New'],
        ['fa-folder-plus', 'Create Folder or Item'],
        ['fa-user-plus', 'Create New Character'],
        ['fa-floppy-disk', 'Save'],
        ['fa-save', 'Save'],
        ['fa-rotate-left', 'Undo or Restore'],
        ['fa-undo', 'Undo'],
        ['fa-rotate-right', 'Refresh or Regenerate'],
        ['fa-arrows-rotate', 'Refresh'],
        ['fa-sync', 'Refresh'],
        ['fa-star', 'Favorite'],
        ['fa-check', 'Confirm'],
        ['fa-xmark', 'Close or Cancel'],
        ['fa-times', 'Close or Cancel'],
        ['fa-chevron-left', 'Previous'],
        ['fa-chevron-right', 'Next'],
        ['fa-arrow-left', 'Back'],
        ['fa-arrow-right', 'Forward'],
        ['fa-unlink', 'Unlink or Remove'],
        ['fa-link', 'Link'],
        ['fa-eye-slash', 'Hidden from AI Context'],
        ['fa-eye', 'Included in AI Context'],
        ['fa-lock', 'Locked'],
        ['fa-unlock', 'Unlocked'],
        ['fa-volume-high', 'Read Aloud'],
        ['fa-comments', 'Chat History'],
        ['fa-ellipsis', 'More Actions']
    ];

    // 4. Inject CSS (eliminates iOS :hover first-tap trap on Edit/message buttons & hides old messages)
    function injectStyles() {
        if (document.getElementById('st-vo-styles')) return;
        const style = document.createElement('style');
        style.id = 'st-vo-styles';
        style.textContent = `
            .st-vo-hidden-mes {
                display: none !important;
            }
            button,
            input,
            select,
            textarea,
            .menu_button,
            .drawer-icon,
            .drawer-toggle,
            .inline-drawer-toggle,
            .character_select,
            .group_select,
            .qr--button,
            .list-group-item,
            .mes_button,
            .mes_edit,
            .swipe_left,
            .swipe_right,
            #send_but,
            #options_button,
            #extensionsMenuButton,
            #mes_stop,
            [role="button"],
            [role="switch"] {
                touch-action: manipulation;
            }
            /* Prevent iOS Safari from eating the first VoiceOver double-tap as a :hover change */
            #chat .mes .mes_buttons,
            #chat .mes:hover .mes_buttons,
            #chat .mes .mes_edit_buttons {
                opacity: 1 !important;
                visibility: visible !important;
                transition: none !important;
            }
            #chat .mes .mes_button,
            #chat .mes .mes_button:hover,
            #chat .mes .mes_edit,
            #chat .mes .mes_edit:hover,
            #chat .mes .extraMesButtons > div,
            #chat .mes .extraMesButtons > div:hover,
            #chat .mes .mes_edit_buttons > div,
            #chat .mes .mes_edit_buttons > div:hover {
                opacity: 1 !important;
                visibility: visible !important;
                filter: none !important;
                transition: none !important;
                padding: 5px;
                cursor: pointer;
            }
            #chat .mes .swipe_left,
            #chat .mes .swipe_right {
                transition: none !important;
                cursor: pointer;
            }
            #st-vo-history-controls {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                padding: 10px;
                justify-content: center;
                background: rgba(0, 0, 0, 0.5);
                border-bottom: 1px solid rgba(255, 255, 255, 0.25);
                margin-bottom: 6px;
            }
            #st-vo-history-controls button,
            .st-vo-close-drawer-btn,
            .st-vo-close-popover-btn {
                padding: 10px 14px;
                font-size: 15px;
                font-weight: 600;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.45);
                background: #262626;
                color: #ffffff;
                cursor: pointer;
            }
            .st-vo-drawer-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 8px 10px;
                margin-bottom: 8px;
                background: rgba(0, 0, 0, 0.45);
                border-bottom: 1px solid rgba(255, 255, 255, 0.25);
            }
            .st-vo-drawer-title {
                margin: 0;
                font-size: 16px;
                font-weight: 700;
                color: #ffffff;
            }
            .st-vo-close-popover-btn {
                width: 100%;
                margin-bottom: 6px;
                text-align: left;
            }
            #st-vo-announcer {
                position: fixed;
                width: 1px;
                height: 1px;
                padding: 0;
                margin: -1px;
                overflow: hidden;
                clip: rect(0, 0, 0, 0);
                clip-path: inset(50%);
                white-space: nowrap;
                border: 0;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    }

    // 5. Polite screen-reader live region (exempt from inert locks)
    function ensureAnnouncer() {
        let el = document.getElementById('st-vo-announcer');
        if (!el) {
            el = document.createElement('div');
            el.id = 'st-vo-announcer';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            el.setAttribute('aria-atomic', 'true');
            document.body.appendChild(el);
        }
        return el;
    }

    function announce(message) {
        if (!message) return;
        const el = ensureAnnouncer();
        el.textContent = '';
        if (announceTimer) clearTimeout(announceTimer);
        announceTimer = setTimeout(() => {
            el.textContent = message;
        }, 60);
    }

    // 6. Visibility checks (mobile position:fixed and slideToggle transition safe)
    function isElementVisible(el) {
        if (!el || !document.body.contains(el)) return false;
        if (el.classList.contains('closedDrawer')) return false;
        if (el.style && el.style.display === 'none') return false;
        if (el.getClientRects().length === 0) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) !== 0;
    }

    function isDrawerOpen(drawer) {
        if (!drawer || !document.body.contains(drawer)) return false;
        if (!drawer.classList.contains('openDrawer') || drawer.classList.contains('closedDrawer')) {
            return false;
        }
        const style = window.getComputedStyle(drawer);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function isGeneratingNow() {
        const stopBtn = document.getElementById('mes_stop');
        return Boolean(stopBtn && isElementVisible(stopBtn));
    }

    // 7. Layer Locking Helpers (inert + aria-hidden blocks iOS VoiceOver background bleed)
    function setNodeLock(el, shouldLock) {
        if (!el || el.id === 'st-vo-announcer') return;
        const tag = el.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'META') return;

        if (shouldLock) {
            if (!el.inert) el.inert = true;
            if (el.getAttribute('aria-hidden') !== 'true') {
                el.setAttribute('aria-hidden', 'true');
            }
            el.setAttribute('data-st-vo-locked', '1');
        } else if (el.getAttribute('data-st-vo-locked') === '1') {
            el.inert = false;
            el.removeAttribute('aria-hidden');
            el.removeAttribute('data-st-vo-locked');
        }
    }

    function unlockAllManagedLocks() {
        document.querySelectorAll('[data-st-vo-locked="1"]').forEach(el => {
            setNodeLock(el, false);
        });
    }

    function lockClosedDrawersForSpeed() {
        document.querySelectorAll('.drawer-content').forEach(drawer => {
            if (!isDrawerOpen(drawer)) {
                if (!drawer.inert) drawer.inert = true;
                if (drawer.getAttribute('aria-hidden') !== 'true') {
                    drawer.setAttribute('aria-hidden', 'true');
                }
            } else if (drawer.getAttribute('data-st-vo-locked') !== '1') {
                drawer.inert = false;
                drawer.removeAttribute('aria-hidden');
            }
        });
    }

    function applyRecursiveIsolation(parent, allowedList) {
        if (!parent || !parent.children) return;
        const children = parent.children;

        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const tag = child.tagName;
            if (
                tag === 'SCRIPT' ||
                tag === 'STYLE' ||
                tag === 'LINK' ||
                tag === 'META' ||
                child.id === 'st-vo-announcer'
            ) {
                continue;
            }

            if (allowedList.includes(child)) {
                setNodeLock(child, false);
                continue;
            }

            let containsAllowed = false;
            for (let j = 0; j < allowedList.length; j++) {
                if (child.contains(allowedList[j])) {
                    containsAllowed = true;
                    break;
                }
            }

            if (containsAllowed) {
                setNodeLock(child, false);
                applyRecursiveIsolation(child, allowedList);
            } else {
                setNodeLock(child, true);
            }
        }
    }

    // 8. Inject accessible header & Close button inside top drawers and popovers
    function getDrawerTitle(drawerContent) {
        const wrapper = drawerContent.closest('.drawer');
        const toggle = wrapper ? wrapper.querySelector('.drawer-toggle') : null;
        const key = (wrapper && wrapper.id) || (toggle && toggle.id) || '';
        if (DRAWER_LABELS[key]) return DRAWER_LABELS[key];

        const icon = wrapper ? wrapper.querySelector('.drawer-icon') : null;
        return (
            (icon && icon.getAttribute('data-st-vo-base')) ||
            (icon && icon.getAttribute('title')) ||
            (toggle && toggle.getAttribute('title')) ||
            'Settings Menu'
        );
    }

    function ensureDrawerHeader(drawerContent) {
        let bar = drawerContent.querySelector(':scope > .st-vo-drawer-bar');
        const titleText = getDrawerTitle(drawerContent);

        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'st-vo-drawer-bar';

            const heading = document.createElement('h2');
            heading.className = 'st-vo-drawer-title';
            heading.tabIndex = -1;
            heading.textContent = titleText;

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'st-vo-close-drawer-btn';
            closeBtn.textContent = `Close ${titleText}`;
            closeBtn.setAttribute('aria-label', `Close ${titleText} and Return to Chat`);
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const wrapper = drawerContent.closest('.drawer');
                const target = wrapper && (wrapper.querySelector('.drawer-icon') || wrapper.querySelector('.drawer-toggle'));
                if (target) {
                    target.click();
                } else {
                    drawerContent.classList.remove('openDrawer');
                    drawerContent.classList.add('closedDrawer');
                    scheduleLayerSync(true);
                }
            });

            bar.appendChild(closeBtn);
            bar.appendChild(heading);
            drawerContent.prepend(bar);
        } else {
            const heading = bar.querySelector('.st-vo-drawer-title');
            const closeBtn = bar.querySelector('.st-vo-close-drawer-btn');
            if (heading && heading.textContent !== titleText) {
                heading.textContent = titleText;
            }
            if (closeBtn) {
                closeBtn.textContent = `Close ${titleText}`;
                closeBtn.setAttribute('aria-label', `Close ${titleText} and Return to Chat`);
            }
        }
        return bar.querySelector('.st-vo-close-drawer-btn');
    }

    function ensurePopoverCloseButton(menuEl, menuName, triggerId) {
        let btn = menuEl.querySelector(':scope > .st-vo-close-popover-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'st-vo-close-popover-btn';
            btn.textContent = `Close ${menuName}`;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const trigger = document.getElementById(triggerId);
                if (window.jQuery) {
                    window.jQuery(menuEl).hide();
                } else {
                    menuEl.style.display = 'none';
                }
                scheduleLayerSync(false);
                if (trigger) focusSafely(trigger, 80);
            });
            menuEl.prepend(btn);
        }
        return btn;
    }

    function focusSafely(el, delayMs = 220) {
        if (!el) return;
        setTimeout(() => {
            if (el && document.body.contains(el) && !el.inert) {
                try {
                    el.focus({ preventScroll: false });
                } catch (_) {
                    el.focus();
                }
            }
        }, delayMs);
    }

    // 9. Master Layer Manager: Isolates background layers whenever menus/popups open
    function syncLayerIsolation() {
        ensureAnnouncer();
        enhanceTopBarAndComposer();

        const preloader = document.getElementById('preloader');
        if (preloader) {
            preloader.inert = true;
            preloader.setAttribute('aria-hidden', 'true');
        }

        // Priority A: Modal Popups and Dialogs
        const candidateDialogs = Array.from(
            document.querySelectorAll('dialog.popup[open], dialog[open], #dialogue_popup, #shadow_popup')
        ).filter(isElementVisible);

        if (candidateDialogs.length > 0) {
            const topDialog = candidateDialogs[candidateDialogs.length - 1];
            unlockAllManagedLocks();
            enhanceContainer(topDialog);
            enhancePopupButtons(topDialog);

            applyRecursiveIsolation(document.body, [topDialog]);

            if (activePrimaryOverlay !== topDialog) {
                activePrimaryOverlay = topDialog;
                if (!topDialog.hasAttribute('role')) topDialog.setAttribute('role', 'dialog');
                const firstFocus = topDialog.querySelector(
                    'input:not([type="hidden"]), textarea, select, button, .popup-button-ok, .menu_button[tabindex="0"]'
                );
                focusSafely(firstFocus || topDialog, 140);
            }
            return;
        }

        // Priority B: Quick Popover Menus (#options or #extensionsMenu)
        const optionsMenu = document.getElementById('options');
        if (optionsMenu && isElementVisible(optionsMenu)) {
            const closeBtn = ensurePopoverCloseButton(optionsMenu, 'Chat Actions Menu', 'options_button');
            const trigger = document.getElementById('options_button');
            unlockAllManagedLocks();
            lockClosedDrawersForSpeed();
            enhanceContainer(optionsMenu);

            const allowed = [optionsMenu];
            if (trigger) allowed.push(trigger);
            applyRecursiveIsolation(document.body, allowed);

            if (activePrimaryOverlay !== optionsMenu) {
                activePrimaryOverlay = optionsMenu;
                focusSafely(closeBtn, 120);
            }
            return;
        }

        const extMenu = document.getElementById('extensionsMenu');
        if (extMenu && isElementVisible(extMenu)) {
            const closeBtn = ensurePopoverCloseButton(extMenu, 'Extensions Quick Menu', 'extensionsMenuButton');
            const trigger = document.getElementById('extensionsMenuButton');
            unlockAllManagedLocks();
            lockClosedDrawersForSpeed();
            enhanceContainer(extMenu);

            const allowed = [extMenu];
            if (trigger) allowed.push(trigger);
            applyRecursiveIsolation(document.body, allowed);

            if (activePrimaryOverlay !== extMenu) {
                activePrimaryOverlay = extMenu;
                focusSafely(closeBtn, 120);
            }
            return;
        }

        // Priority C: Open Top-Bar Drawers (Sliders, Lorebook, API, Extensions, Characters, etc.)
        const openDrawers = Array.from(document.querySelectorAll('.drawer-content')).filter(isDrawerOpen);

        if (openDrawers.length > 0) {
            const primaryDrawer = openDrawers[openDrawers.length - 1];
            unlockAllManagedLocks();
            lockClosedDrawersForSpeed();

            let primaryCloseBtn = null;
            openDrawers.forEach(drawer => {
                const btn = ensureDrawerHeader(drawer);
                if (drawer === primaryDrawer) primaryCloseBtn = btn;
                enhanceContainer(drawer);
            });

            const topIcons = Array.from(
                document.querySelectorAll('#top-settings-holder .drawer-toggle, #top-bar .drawer-toggle')
            );
            const allowed = [...openDrawers, ...topIcons];
            applyRecursiveIsolation(document.body, allowed);

            if (activePrimaryOverlay !== primaryDrawer) {
                activePrimaryOverlay = primaryDrawer;
                focusSafely(primaryCloseBtn, 240);
            }
            return;
        }

        // Priority D: Floating Panels over Chat (Author's Note or Guidance Scale)
        const floatingPanels = ['floatingPrompt', 'cfgConfig']
            .map(id => document.getElementById(id))
            .filter(el => el && isElementVisible(el));

        if (floatingPanels.length > 0) {
            const topFloating = floatingPanels[floatingPanels.length - 1];
            unlockAllManagedLocks();
            lockClosedDrawersForSpeed();
            enhanceContainer(topFloating);

            const topIcons = Array.from(
                document.querySelectorAll('#top-settings-holder .drawer-toggle, #top-bar .drawer-toggle')
            );
            applyRecursiveIsolation(document.body, [topFloating, ...topIcons]);

            if (activePrimaryOverlay !== topFloating) {
                activePrimaryOverlay = topFloating;
                const focusTarget = topFloating.querySelector(
                    '#floatingPromptClose, #cfgClose, textarea, input, button, [role="button"]'
                );
                focusSafely(focusTarget || topFloating, 160);
            }
            return;
        }

        // Priority E: Normal Chat View (All menus and overlays closed)
        const justClosedOverlay = activePrimaryOverlay !== null;
        activePrimaryOverlay = null;
        unlockAllManagedLocks();
        lockClosedDrawersForSpeed();

        if (justClosedOverlay) {
            const fallbackInput = document.getElementById('send_textarea');
            const returnTarget = (lastTriggerElement && document.body.contains(lastTriggerElement) && !lastTriggerElement.inert)
                ? lastTriggerElement
                : fallbackInput;
            focusSafely(returnTarget, 120);
        }
    }

    function scheduleLayerSync(withPostAnimationPass = false) {
        if (layerRafId) cancelAnimationFrame(layerRafId);
        layerRafId = requestAnimationFrame(() => {
            layerRafId = null;
            try {
                syncLayerIsolation();
            } catch (err) {
                console.warn('ST VoiceOver layer sync warning:', err);
            }
        });

        if (withPostAnimationPass) {
            if (postAnimLayerTimer) clearTimeout(postAnimLayerTimer);
            postAnimLayerTimer = setTimeout(() => {
                postAnimLayerTimer = null;
                try {
                    syncLayerIsolation();
                } catch (err) {
                    console.warn('ST VoiceOver post-animation sync warning:', err);
                }
            }, 260);
        }
    }

    // 10. Keep only latest 6 messages on screen to eliminate VoiceOver lag
    function updateChatLagLimiter() {
        const chat = document.getElementById('chat');
        if (!chat) return;

        const messages = Array.from(chat.querySelectorAll(':scope > .mes'));
        const total = messages.length;
        const firstMes = messages[0] || null;

        if (firstMes !== currentFirstMesNode) {
            currentFirstMesNode = firstMes;
            visibleMessageLimit = DEFAULT_VISIBLE_MESSAGES;
            lastRenderedHidden = -1;
        }

        const hiddenCount = Math.max(0, total - visibleMessageLimit);
        let controls = document.getElementById('st-vo-history-controls');

        if (total > DEFAULT_VISIBLE_MESSAGES) {
            if (!controls) {
                controls = document.createElement('div');
                controls.id = 'st-vo-history-controls';
                chat.prepend(controls);
                lastRenderedHidden = -1;
            }

            if (lastRenderedHidden !== hiddenCount || lastRenderedLimit !== visibleMessageLimit) {
                lastRenderedHidden = hiddenCount;
                lastRenderedLimit = visibleMessageLimit;
                controls.innerHTML = '';

                if (hiddenCount > 0) {
                    const showMoreBtn = document.createElement('button');
                    showMoreBtn.type = 'button';
                    const step = Math.min(DEFAULT_VISIBLE_MESSAGES, hiddenCount);
                    showMoreBtn.textContent = `Show ${step} Older Messages (${hiddenCount} hidden)`;
                    showMoreBtn.addEventListener('click', () => {
                        visibleMessageLimit += DEFAULT_VISIBLE_MESSAGES;
                        updateChatLagLimiter();
                        announce(`Showing latest ${Math.min(total, visibleMessageLimit)} messages.`);
                    });
                    controls.appendChild(showMoreBtn);
                }

                if (visibleMessageLimit > DEFAULT_VISIBLE_MESSAGES) {
                    const resetBtn = document.createElement('button');
                    resetBtn.type = 'button';
                    resetBtn.textContent = `Hide Older Messages (Keep Latest ${DEFAULT_VISIBLE_MESSAGES})`;
                    resetBtn.addEventListener('click', () => {
                        visibleMessageLimit = DEFAULT_VISIBLE_MESSAGES;
                        updateChatLagLimiter();
                        announce(`Hid older messages. Keeping latest ${DEFAULT_VISIBLE_MESSAGES}.`);
                    });
                    controls.appendChild(resetBtn);
                }
            }
        } else if (controls) {
            controls.remove();
            lastRenderedHidden = -1;
        }

        const cutoffIndex = total - visibleMessageLimit;
        for (let i = 0; i < total; i++) {
            const mes = messages[i];
            if (i < cutoffIndex) {
                if (!mes._stVoHidden) {
                    mes._stVoHidden = true;
                    mes.classList.add('st-vo-hidden-mes');
                    mes.inert = true;
                    mes.setAttribute('aria-hidden', 'true');
                }
            } else {
                if (mes._stVoHidden) {
                    mes._stVoHidden = false;
                    mes.classList.remove('st-vo-hidden-mes');
                    mes.inert = false;
                    mes.removeAttribute('aria-hidden');
                }
                enhanceSingleMessage(mes);
            }
        }
    }

    function scheduleChatLimiter(delay = 80) {
        if (chatLimiterTimer) clearTimeout(chatLimiterTimer);
        chatLimiterTimer = setTimeout(() => {
            chatLimiterTimer = null;
            updateChatLagLimiter();
        }, delay);
    }

    // 11. Enhance visible chat messages, headings, swipe counts, edit mode, and buttons
    function enhanceSingleMessage(mes) {
        const nameEl = mes.querySelector('.ch_name');
        const charName = (nameEl && nameEl.textContent.trim()) || 'Character';
        const isHiddenFromContext = mes.getAttribute('is_system') === 'true';

        if (nameEl) {
            nameEl.setAttribute('role', 'heading');
            nameEl.setAttribute('aria-level', '3');
            const desiredHeadingLabel = isHiddenFromContext
                ? `${charName} (Hidden from AI Context)`
                : charName;
            if (nameEl.getAttribute('aria-label') !== desiredHeadingLabel) {
                nameEl.setAttribute('aria-label', desiredHeadingLabel);
            }
        }

        const swipeCounter = mes.querySelector('.swipes-counter');
        const swipeInfo = (swipeCounter && swipeCounter.textContent.trim())
            ? `, Swipe ${swipeCounter.textContent.trim().replace('/', ' of ')}`
            : '';

        const swipeLeft = mes.querySelector('.swipe_left');
        if (swipeLeft) makeAccessibleButton(swipeLeft, `Previous Response for ${charName}${swipeInfo}`);

        const swipeRight = mes.querySelector('.swipe_right');
        if (swipeRight) makeAccessibleButton(swipeRight, `Next or Generate New Response for ${charName}${swipeInfo}`);

        const reasoningSummary = mes.querySelector(
            '.mes_reasoning_header, details.mes_reasoning_details > summary, details > summary'
        );
        if (reasoningSummary && !reasoningSummary.getAttribute('data-st-vo-reason')) {
            reasoningSummary.setAttribute('data-st-vo-reason', '1');
            const summaryText = reasoningSummary.textContent.trim() || 'Thought Process';
            reasoningSummary.setAttribute('aria-label', `AI Reasoning for ${charName}: ${summaryText}`);
        }

        const editTa = mes.querySelector('textarea.edit_textarea, .mes_block textarea');
        if (editTa && !editTa.getAttribute('aria-label')) {
            editTa.setAttribute('aria-label', `Edit Message from ${charName}`);
        }

        if (mes.getAttribute('data-vo-mes-ready') === '1') return;

        const msgButtonMap = [
            ['.mes_edit', `Edit Message from ${charName}`],
            ['.mes_edit_done', 'Save Edited Message'],
            ['.mes_edit_cancel', 'Cancel Editing Message'],
            ['.mes_edit_delete', 'Delete This Message'],
            ['.mes_edit_copy', 'Copy Message Text'],
            ['.mes_copy', `Copy Message from ${charName}`],
            ['.mes_bookmark', 'Checkpoint or Bookmark Chat Here'],
            ['.mes_create_branch', 'Create Branch from Message'],
            ['.mes_narrate', `Read Aloud Message from ${charName}`],
            ['.mes_hide', 'Hide Message from AI Context'],
            ['.mes_unhide', 'Include Message in AI Context'],
            ['.mes_translate', `Translate Message from ${charName}`],
            ['.extraMesButtonsHint', `More Message Actions for ${charName}`]
        ];

        msgButtonMap.forEach(([selector, label]) => {
            const btn = mes.querySelector(selector);
            if (btn) makeAccessibleButton(btn, label);
        });

        mes.querySelectorAll('.extraMesButtons > div, .extraMesButtons > i, .mes_buttons > div').forEach(btn => {
            if (!btn.getAttribute('aria-label')) {
                const title = (btn.getAttribute('title') || '').trim();
                const inferred = title || inferLabelFromIcons(btn);
                if (inferred) makeAccessibleButton(btn, `${inferred} (${charName})`);
            }
        });

        const avatar = mes.querySelector('.avatar, .mesAvatarWrapper');
        if (avatar) avatar.setAttribute('aria-hidden', 'true');

        mes.setAttribute('data-vo-mes-ready', '1');
    }

    // Label and focus the dynamic edit box as soon as Edit opens
    function enhanceActiveEditMode(mes) {
        if (!mes || !document.body.contains(mes)) return false;
        const editTa = mes.querySelector('textarea.edit_textarea, .mes_block textarea');
        if (!editTa) return false;

        const nameEl = mes.querySelector('.ch_name');
        const charName = (nameEl && nameEl.textContent.trim()) || 'Character';

        editTa.setAttribute('aria-label', `Edit Message from ${charName}`);

        const editButtonsMap = [
            ['.mes_edit_done', 'Save Edited Message'],
            ['.mes_edit_cancel', 'Cancel Editing Message'],
            ['.mes_edit_delete', 'Delete This Message'],
            ['.mes_edit_copy', 'Copy Message Text']
        ];
        editButtonsMap.forEach(([sel, label]) => {
            const btn = mes.querySelector(sel);
            if (btn) makeAccessibleButton(btn, label);
        });

        if (document.activeElement !== editTa) {
            focusSafely(editTa, 30);
        }
        return true;
    }

    // Keep chat buttons in the unobstructed middle zone of #chat before double-tap
    function ensureChatControlInSafeView(el) {
        const chat = document.getElementById('chat');
        if (!chat || !el || !chat.contains(el)) return;

        const chatRect = chat.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (elRect.width === 0 && elRect.height === 0) return;

        const topBar = document.getElementById('top-bar') || document.getElementById('top-settings-holder');
        const topBarBottom = topBar ? topBar.getBoundingClientRect().bottom : 0;
        const formSheld = document.getElementById('form_sheld');
        const formTop = formSheld ? formSheld.getBoundingClientRect().top : window.innerHeight;

        const safeTop = Math.max(chatRect.top, topBarBottom) + 14;
        const safeBottom = Math.min(chatRect.bottom, formTop) - 14;

        if (elRect.top < safeTop) {
            chat.scrollTop -= (safeTop - elRect.top + 24);
        } else if (elRect.bottom > safeBottom) {
            chat.scrollTop += (elRect.bottom - safeBottom + 24);
        }
    }

    // 12. Safe button conversion helpers (never converts outer layout wrappers into buttons)
    function isContainerElement(el) {
        if (!el) return true;
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (tag === 'form' || tag === 'label' || tag === 'select' || tag === 'input' || tag === 'textarea') {
            return true;
        }
        if (
            el.classList.contains('drawer') ||
            el.classList.contains('drawer-content') ||
            el.classList.contains('inline-drawer') ||
            el.classList.contains('inline-drawer-content') ||
            el.classList.contains('range-block')
        ) {
            return true;
        }
        if (el.querySelector('.drawer-content, .inline-drawer-content, input, select, textarea, .range-block')) {
            return true;
        }
        return false;
    }

    function makeAccessibleButton(el, label) {
        if (!el || !label) return;
        const tag = el.tagName ? el.tagName.toLowerCase() : '';

        if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button') {
            if (el.getAttribute('aria-label') !== label) {
                el.setAttribute('aria-label', label);
            }
            return;
        }

        if (isContainerElement(el)) return;

        if (el.getAttribute('aria-label') !== label) {
            el.setAttribute('aria-label', label);
        }
        if (!el.getAttribute('role')) {
            el.setAttribute('role', 'button');
            el.setAttribute('data-st-vo-role-btn', '1');
        }
        if (!el.hasAttribute('tabindex')) {
            el.setAttribute('tabindex', '0');
        }
    }

    function inferLabelFromIcons(el) {
        const classStr = [
            el.className || '',
            ...Array.from(el.querySelectorAll('i, span')).map(c => c.className || '')
        ].join(' ');

        for (let i = 0; i < ICON_LABELS.length; i++) {
            const [iconClass, spokenLabel] = ICON_LABELS[i];
            if (classStr.includes(iconClass)) {
                return spokenLabel;
            }
        }
        return null;
    }

    // 13. Fast Top-Bar, Quick Replies, and Bottom Composer Enhancer
    function enhanceTopBarAndComposer() {
        document.querySelectorAll('#top-settings-holder .drawer, #top-bar .drawer').forEach((drawer, idx) => {
            drawer.removeAttribute('role');
            drawer.removeAttribute('tabindex');
            drawer.removeAttribute('aria-label');

            const toggle = drawer.querySelector('.drawer-toggle');
            const icon = drawer.querySelector('.drawer-icon');
            const content = drawer.querySelector('.drawer-content');

            if (toggle && icon && toggle !== icon) {
                toggle.removeAttribute('role');
                toggle.removeAttribute('tabindex');
                toggle.removeAttribute('aria-label');
            }

            const open = Boolean(content && isDrawerOpen(content));
            const target = icon || toggle;
            if (!target) return;

            const drawerKey = drawer.id || (toggle && toggle.id) || '';
            const baseLabel =
                DRAWER_LABELS[drawerKey] ||
                target.getAttribute('data-st-vo-base') ||
                target.getAttribute('title') ||
                (toggle && toggle.getAttribute('title')) ||
                inferLabelFromIcons(target) ||
                `Top Menu ${idx + 1}`;

            target.setAttribute('data-st-vo-base', baseLabel);
            if (target.getAttribute('aria-label') !== baseLabel) {
                target.setAttribute('aria-label', baseLabel);
            }
            target.setAttribute('role', 'button');
            target.setAttribute('data-st-vo-role-btn', '1');
            target.setAttribute('tabindex', '0');
            target.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        ['send_but', 'send_textarea', 'options_button', 'extensionsMenuButton', 'mes_stop'].forEach(id => {
            const el = document.getElementById(id);
            if (el && ID_LABELS[id]) makeAccessibleButton(el, ID_LABELS[id]);
        });

        const optBtn = document.getElementById('options_button');
        const optMenu = document.getElementById('options');
        if (optBtn) optBtn.setAttribute('aria-expanded', (optMenu && isElementVisible(optMenu)) ? 'true' : 'false');

        const extBtn = document.getElementById('extensionsMenuButton');
        const extMenu = document.getElementById('extensionsMenu');
        if (extBtn) extBtn.setAttribute('aria-expanded', (extMenu && isElementVisible(extMenu)) ? 'true' : 'false');

        document.querySelectorAll('#qr--bar .qr--button').forEach(qrBtn => {
            const text = qrBtn.textContent ? qrBtn.textContent.trim() : '';
            const title = (qrBtn.getAttribute('title') || '').trim();
            const label = text || title || 'Quick Reply';
            makeAccessibleButton(qrBtn, `Quick Reply: ${label}`);
        });
    }

    // 14. Scoped Container Enhancer (only scans the currently open drawer, menu, or popup)
    function enhanceContainer(root) {
        if (!root) return;

        Object.entries(ID_LABELS).forEach(([id, label]) => {
            const el = document.getElementById(id);
            if (el && root.contains(el)) makeAccessibleButton(el, label);
        });

        // Collapsible .inline-drawer accordions
        root.querySelectorAll('.inline-drawer').forEach(acc => {
            const header = acc.querySelector(':scope > .inline-drawer-toggle, :scope > .inline-drawer-header');
            const content = acc.querySelector(':scope > .inline-drawer-content');
            const icon = header ? header.querySelector('.inline-drawer-icon') : null;
            if (!header) return;

            const isExpanded = content
                ? content.style.display !== 'none' && (!icon || !icon.classList.contains('down') || icon.classList.contains('up'))
                : Boolean(icon && icon.classList.contains('up'));

            if (content) {
                if (!isExpanded && content.style.display === 'none') {
                    content.inert = true;
                } else if (content.inert && root.getAttribute('data-st-vo-locked') !== '1') {
                    content.inert = false;
                }
            }

            const titleNode = header.querySelector('b, strong, h3, h4, span:not(.inline-drawer-icon)');
            const accTitle = (titleNode ? titleNode.textContent : header.textContent || '').trim() || 'Section';

            const hasNestedControls = Boolean(
                header.querySelector('input, select, textarea, button, .menu_button:not(.inline-drawer-icon)')
            );
            const buttonTarget = (hasNestedControls && icon) ? icon : header;

            buttonTarget.setAttribute('role', 'button');
            buttonTarget.setAttribute('data-st-vo-role-btn', '1');
            buttonTarget.setAttribute('tabindex', '0');
            buttonTarget.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
            if (buttonTarget === icon || !buttonTarget.getAttribute('aria-label')) {
                buttonTarget.setAttribute('aria-label', accTitle);
            }
        });

        // Sliders and Paired Numeric Inputs (.range-block)
        root.querySelectorAll('.range-block').forEach(block => {
            const titleEl = block.querySelector('.range-block-title, label, b, span');
            if (!titleEl) return;
            const rawTitle = titleEl.textContent.replace(/\s+/g, ' ').trim();
            if (!rawTitle) return;

            const rangeInput = block.querySelector('input[type="range"]');
            if (rangeInput && !rangeInput.getAttribute('aria-label')) {
                rangeInput.setAttribute('aria-label', `${rawTitle} Slider`);
            }

            const numInput = block.querySelector('input[type="number"], .neo-range-input');
            if (numInput && !numInput.getAttribute('aria-label')) {
                numInput.setAttribute('aria-label', `${rawTitle} Value`);
            }
        });

        // Prompt Manager Switches and Buttons
        root.querySelectorAll('.completion_prompt_manager_prompt').forEach(row => {
            const nameNode = row.querySelector('.completion_prompt_manager_prompt_name a, .completion_prompt_manager_prompt_name');
            const promptName = nameNode ? nameNode.textContent.trim() : 'Prompt';
            if (!promptName) return;

            const toggleBtn = row.querySelector('.prompt_manager_prompt_toggle, .fa-toggle-on, .fa-toggle-off');
            if (toggleBtn) {
                const isOff =
                    row.classList.contains('completion_prompt_manager_prompt_disabled') ||
                    toggleBtn.classList.contains('fa-toggle-off') ||
                    Boolean(toggleBtn.querySelector('.fa-toggle-off'));
                toggleBtn.setAttribute('role', 'switch');
                toggleBtn.setAttribute('data-st-vo-role-btn', '1');
                toggleBtn.setAttribute('tabindex', '0');
                toggleBtn.setAttribute('aria-checked', isOff ? 'false' : 'true');
                toggleBtn.setAttribute('aria-label', promptName);
            }

            const editBtn = row.querySelector('.prompt_manager_prompt_edit, .fa-pencil, .fa-pen-to-square, .fa-pen');
            if (editBtn) {
                const target = editBtn.closest('a, span, button, div.menu_button') || editBtn;
                makeAccessibleButton(target, `Edit Prompt: ${promptName}`);
            }

            const delBtn = row.querySelector('.prompt_manager_prompt_delete, .fa-trash, .fa-trash-can, .fa-unlink, .fa-xmark');
            if (delBtn) {
                const target = delBtn.closest('a, span, button, div.menu_button') || delBtn;
                makeAccessibleButton(target, `Remove Prompt: ${promptName}`);
            }
        });

        // Lorebook / World Info Entries
        root.querySelectorAll('.world_entry').forEach((row, index) => {
            const commentInput = row.querySelector('input[name="comment"]');
            const keyInput = row.querySelector('textarea[name="key"], input[name="key"]');
            const entryName =
                (commentInput && commentInput.value && commentInput.value.trim()) ||
                (keyInput && keyInput.value && keyInput.value.trim()) ||
                `Lorebook Entry ${index + 1}`;

            const killSwitch = row.querySelector('.killSwitch');
            if (killSwitch) {
                const isOff = killSwitch.classList.contains('fa-toggle-off') || killSwitch.classList.contains('disabled');
                killSwitch.setAttribute('role', 'switch');
                killSwitch.setAttribute('data-st-vo-role-btn', '1');
                killSwitch.setAttribute('tabindex', '0');
                killSwitch.setAttribute('aria-checked', isOff ? 'false' : 'true');
                killSwitch.setAttribute('aria-label', `${entryName} Active`);
            }

            if (commentInput && !commentInput.getAttribute('aria-label')) {
                commentInput.setAttribute('aria-label', `Title or Comment for ${entryName}`);
            }
            if (keyInput && !keyInput.getAttribute('aria-label')) {
                keyInput.setAttribute('aria-label', `Trigger Keywords for ${entryName}`);
            }
            const contentArea = row.querySelector('textarea[name="content"]');
            if (contentArea && !contentArea.getAttribute('aria-label')) {
                contentArea.setAttribute('aria-label', `Lore Content for ${entryName}`);
            }
        });

        // Character and Group Cards
        root.querySelectorAll('.character_select:not([data-vo-char="1"]), .group_select:not([data-vo-char="1"])').forEach(card => {
            const nameEl = card.querySelector('.ch_name');
            if (nameEl && nameEl.textContent.trim()) {
                card.setAttribute('data-vo-char', '1');
                const prefix = card.classList.contains('group_select') ? 'Select Group' : 'Select Character';
                card.setAttribute('aria-label', `${prefix}: ${nameEl.textContent.trim()}`);
                card.setAttribute('role', 'button');
                card.setAttribute('data-st-vo-role-btn', '1');
                card.setAttribute('tabindex', '0');
            }
        });

        // Popover list items
        root.querySelectorAll('.list-group-item, #options a, #options li').forEach(item => {
            if (item.classList.contains('st-vo-close-popover-btn')) return;
            const text = item.textContent ? item.textContent.replace(/\s+/g, ' ').trim() : '';
            if (text && !item.getAttribute('role') && item.tagName !== 'BUTTON') {
                makeAccessibleButton(item, ID_LABELS[item.id] || text);
            }
        });

        // Unlabeled Form Inputs inside this open container
        root.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(ctrl => {
            if (ctrl.getAttribute('aria-label') || ctrl.getAttribute('aria-labelledby')) return;
            if (ctrl.id && root.querySelector(`label[for="${CSS.escape(ctrl.id)}"]`)) return;
            if (ctrl.closest('label')) return;

            const placeholder = (ctrl.getAttribute('placeholder') || '').trim();
            const title = (ctrl.getAttribute('title') || '').trim();
            let nearText = '';

            const prev = ctrl.previousElementSibling;
            if (prev && (prev.tagName === 'SPAN' || prev.tagName === 'H4' || prev.tagName === 'B' || prev.tagName === 'LABEL')) {
                nearText = prev.textContent.replace(/\s+/g, ' ').trim();
            }

            const chosen = title || nearText || placeholder || (ctrl.name ? ctrl.name.replace(/_/g, ' ') : '');
            if (chosen) {
                ctrl.setAttribute('aria-label', chosen);
            }
        });

        // Leaf buttons with tooltips or FontAwesome icons inside this open container
        root.querySelectorAll('.menu_button, .fa-solid[title], .fa-regular[title], a[title], button[title]').forEach(el => {
            if (el.classList.contains('drawer-icon') || el.getAttribute('role') === 'switch') return;
            if (el.getAttribute('aria-label')) return;

            const titleText = (el.getAttribute('title') || '').trim();
            if (titleText) {
                makeAccessibleButton(el, titleText);
                return;
            }

            const visibleText = el.textContent ? el.textContent.trim() : '';
            if (visibleText.length <= 1) {
                const inferred = inferLabelFromIcons(el);
                if (inferred) makeAccessibleButton(el, inferred);
            }
        });
    }

    function enhancePopupButtons(dialogEl) {
        const popupMap = [
            ['.popup-button-ok, #dialogue_popup_ok', 'Confirm'],
            ['.popup-button-cancel, #dialogue_popup_cancel', 'Cancel'],
            ['.popup-button-close', 'Close Dialog']
        ];
        popupMap.forEach(([sel, fallback]) => {
            dialogEl.querySelectorAll(sel).forEach(btn => {
                const txt = btn.textContent ? btn.textContent.trim() : '';
                makeAccessibleButton(btn, txt || fallback);
            });
        });
    }

    // 15. Interaction Fixes: Single-Tap Edit Rescue, Focus Alignment, Send Blur, and Keyboard Support
    function setupInteractionFixes() {
        let lastTouchBtn = null;
        let touchStartX = 0;
        let touchStartY = 0;
        let touchMoved = false;

        // A. Ensure chat message controls are inside unobstructed view as soon as VoiceOver focuses them
        document.addEventListener('focusin', (e) => {
            const target = e.target;
            if (!target || !target.closest) return;
            const chatBtn = target.closest(CHAT_ACTION_SELECTOR);
            if (chatBtn) {
                ensureChatControlInSafeView(chatBtn);
            }
        }, true);

        // B. Track touch on Edit and message buttons to rescue swallowed first VoiceOver double-taps
        document.addEventListener('touchstart', (e) => {
            const target = e.target;
            if (!target || !target.closest || !e.touches || e.touches.length !== 1) {
                lastTouchBtn = null;
                return;
            }
            const btn = target.closest(CHAT_ACTION_SELECTOR);
            if (btn) {
                lastTouchBtn = btn;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                touchMoved = false;
            } else {
                lastTouchBtn = null;
            }
        }, { capture: true, passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!lastTouchBtn || !e.touches || e.touches.length !== 1) return;
            if (
                Math.abs(e.touches[0].clientX - touchStartX) > 16 ||
                Math.abs(e.touches[0].clientY - touchStartY) > 16
            ) {
                touchMoved = true;
            }
        }, { capture: true, passive: true });

        document.addEventListener('touchend', () => {
            const btn = lastTouchBtn;
            lastTouchBtn = null;
            if (!btn || touchMoved) return;

            setTimeout(() => {
                if (!document.body.contains(btn) || btn.inert) return;
                if (Date.now() - (btn._stVoNativeClickTs || 0) < 250) return;

                if (btn.classList.contains('mes_edit')) {
                    const mes = btn.closest('.mes');
                    if (mes && mes.querySelector('textarea.edit_textarea, .mes_block textarea')) return;
                }

                btn._stVoRescueTs = Date.now();
                btn._stVoNativeClickTs = Date.now();
                btn._stVoSyntheticClick = true;
                btn.click();
            }, 85);
        }, { capture: true, passive: true });

        // C. Capture-phase click guard to block late duplicate ghost clicks after a rescue click
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!target || !target.closest) return;
            const chatBtn = target.closest(CHAT_ACTION_SELECTOR);
            if (!chatBtn) return;

            if (chatBtn._stVoSyntheticClick) {
                chatBtn._stVoSyntheticClick = false;
                return;
            }
            if (Date.now() - (chatBtn._stVoRescueTs || 0) < 400) {
                e.stopImmediatePropagation();
                e.preventDefault();
                return;
            }
            chatBtn._stVoNativeClickTs = Date.now();
        }, true);

        // D. Main bubble click listener for Edit focus flow, Send blur, and menu trigger tracking
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!target || !target.closest) return;

            const topDrawerIcon = target.closest(
                '#top-settings-holder .drawer-icon, #top-settings-holder .drawer-toggle, #top-bar .drawer-icon, #top-bar .drawer-toggle'
            );
            if (topDrawerIcon) {
                lastTriggerElement = topDrawerIcon;
            } else if (!activePrimaryOverlay) {
                const mainTrigger = target.closest('#options_button, #extensionsMenuButton, .menu_button, button');
                if (mainTrigger) {
                    lastTriggerElement = mainTrigger;
                }
            }

            // Dismiss iOS keyboard cleanly right after Send is activated
            if (target.closest('#send_but')) {
                const ta = document.getElementById('send_textarea');
                if (ta && document.activeElement === ta) {
                    setTimeout(() => ta.blur(), 40);
                }
            }

            // Handle opening Message Edit mode cleanly for VoiceOver
            const editTrigger = target.closest('#chat .mes_edit');
            if (editTrigger) {
                const mes = editTrigger.closest('.mes');
                if (mes) {
                    setTimeout(() => {
                        if (!enhanceActiveEditMode(mes)) {
                            setTimeout(() => enhanceActiveEditMode(mes), 160);
                        }
                    }, 70);
                }
            }

            // Keep VoiceOver right on the message when saving or cancelling an edit
            const finishEditBtn = target.closest('#chat .mes_edit_done, #chat .mes_edit_cancel');
            if (finishEditBtn) {
                const mes = finishEditBtn.closest('.mes');
                const isSave = Boolean(finishEditBtn.closest('.mes_edit_done'));
                if (mes) {
                    setTimeout(() => {
                        const nameEl = mes.querySelector('.ch_name');
                        if (nameEl) {
                            nameEl.setAttribute('tabindex', '-1');
                            focusSafely(nameEl, 30);
                        }
                        announce(isSave ? 'Message edit saved.' : 'Message edit cancelled.');
                    }, 110);
                }
            }

            // Label and focus extra message actions when expanding the three-dots hint
            const extraHint = target.closest('#chat .extraMesButtonsHint');
            if (extraHint) {
                const mes = extraHint.closest('.mes');
                if (mes) {
                    setTimeout(() => {
                        mes.removeAttribute('data-vo-mes-ready');
                        enhanceSingleMessage(mes);
                        const firstExtra = mes.querySelector('.extraMesButtons > div');
                        if (firstExtra && isElementVisible(firstExtra)) {
                            focusSafely(firstExtra, 40);
                        }
                    }, 150);
                }
            }

            // Refresh accessibility states strictly inside the active open menu
            if (activePrimaryOverlay && activePrimaryOverlay.contains(target)) {
                if (openPanelTimer) clearTimeout(openPanelTimer);
                openPanelTimer = setTimeout(() => {
                    if (activePrimaryOverlay && document.body.contains(activePrimaryOverlay)) {
                        enhanceContainer(activePrimaryOverlay);
                    }
                }, 110);
            }
        }, false);

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const el = e.target;
            if (el && el.getAttribute && el.getAttribute('data-st-vo-role-btn') === '1') {
                e.preventDefault();
                el.click();
            }
        });
    }

    // 16. Targeted Observers for Menus, Popups, Streaming Replies, and Status Toasts
    function setupObservers() {
        const chat = document.getElementById('chat');
        if (chat) {
            const chatObserver = new MutationObserver(() => {
                scheduleChatLimiter(60);
            });
            chatObserver.observe(chat, { childList: true });
        }

        const uiObserver = new MutationObserver((mutations) => {
            let needsLayerSync = false;
            let needsPostAnimPass = false;

            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];
                if (m.type === 'childList') {
                    for (let j = 0; j < m.addedNodes.length; j++) {
                        const node = m.addedNodes[j];
                        if (node.nodeType !== 1) continue;
                        if (node.tagName === 'DIALOG' || node.classList.contains('popup')) {
                            needsLayerSync = true;
                        } else if (node.classList.contains('toast') || (node.closest && node.closest('#toast-container'))) {
                            const toastMsg = node.textContent ? node.textContent.replace(/\s+/g, ' ').trim() : '';
                            if (toastMsg) announce(toastMsg);
                        } else if (node.id === 'qr--bar' || (node.classList && node.classList.contains('qr--button'))) {
                            enhanceTopBarAndComposer();
                        }
                    }
                    for (let j = 0; j < m.removedNodes.length; j++) {
                        const node = m.removedNodes[j];
                        if (node.nodeType === 1 && (node.tagName === 'DIALOG' || node.classList.contains('popup'))) {
                            needsLayerSync = true;
                        }
                    }
                } else if (m.type === 'attributes') {
                    const el = m.target;
                    if (el.id === 'mes_stop') {
                        const genNow = isGeneratingNow();
                        if (wasGenerating && !genNow) {
                            updateChatLagLimiter();
                            const lastChar = document.querySelector('#chat > .mes:last-child .ch_name');
                            const speaker = (lastChar && lastChar.textContent.trim()) || 'Character';
                            announce(`Reply finished from ${speaker}`);
                        }
                        wasGenerating = genNow;
                    } else if (el.classList && el.classList.contains('drawer-content')) {
                        needsLayerSync = true;
                        needsPostAnimPass = true;
                    } else if (
                        el.tagName === 'DIALOG' ||
                        el.id === 'options' ||
                        el.id === 'extensionsMenu' ||
                        el.id === 'floatingPrompt' ||
                        el.id === 'cfgConfig' ||
                        el.id === 'dialogue_popup' ||
                        el.id === 'shadow_popup' ||
                        (el.classList && el.classList.contains('popup'))
                    ) {
                        needsLayerSync = true;
                        needsPostAnimPass = true;
                    }
                }
            }

            if (needsLayerSync) {
                scheduleLayerSync(needsPostAnimPass);
            }
        });

        uiObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'open']
        });

        try {
            if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
                const ctx = window.SillyTavern.getContext();
                if (ctx && ctx.eventSource && ctx.event_types) {
                    if (ctx.event_types.CHAT_CHANGED) {
                        ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, () => {
                            visibleMessageLimit = DEFAULT_VISIBLE_MESSAGES;
                            lastRenderedHidden = -1;
                            scheduleChatLimiter(30);
                        });
                    }
                    if (ctx.event_types.MESSAGE_SWIPED) {
                        ctx.eventSource.on(ctx.event_types.MESSAGE_SWIPED, () => {
                            scheduleChatLimiter(40);
                        });
                    }
                }
            }
        } catch (_) {
            // Standard DOM observers handle everything if context hook is unavailable
        }
    }

    function startExtension() {
        injectStyles();
        ensureAnnouncer();
        setupInteractionFixes();
        enhanceTopBarAndComposer();
        updateChatLagLimiter();
        syncLayerIsolation();
        setupObservers();
    }

    // 17. Anti-"Stuck on Initializing" Boot Guard & Rescue Watchdog
    function hideAndLockPreloader(preloader) {
        if (!preloader) return;
        preloader.style.display = 'none';
        preloader.inert = true;
        preloader.setAttribute('aria-hidden', 'true');
    }

    function launchOnceReady(delayMs) {
        if (extensionStarted) return;
        extensionStarted = true;
        setTimeout(() => {
            const preloader = document.getElementById('preloader');
            if (preloader) {
                preloader.inert = true;
                preloader.setAttribute('aria-hidden', 'true');
            }
            startExtension();
        }, delayMs);
    }

    function waitForSillyTavernReady() {
        const bootStartTime = Date.now();
        let appReadyHooked = false;

        const checkInterval = setInterval(() => {
            if (extensionStarted) {
                clearInterval(checkInterval);
                return;
            }

            // Passively listen for SillyTavern's APP_READY signal without mutating anything during boot
            if (!appReadyHooked) {
                try {
                    if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
                        const ctx = window.SillyTavern.getContext();
                        if (ctx && ctx.eventSource && ctx.event_types && ctx.event_types.APP_READY) {
                            appReadyHooked = true;
                            ctx.eventSource.on(ctx.event_types.APP_READY, () => {
                                stAppReadyFired = true;
                            });
                        }
                    }
                } catch (_) {
                    // Safe no-op while SillyTavern is still loading core scripts
                }
            }

            const preloader = document.getElementById('preloader');
            const chat = document.getElementById('chat');
            const sendTa = document.getElementById('send_textarea');
            if (!chat || !sendTa) return;

            let preloaderGone = !preloader;
            if (preloader) {
                const pStyle = window.getComputedStyle(preloader);
                const opacityVal = parseFloat(pStyle.opacity);
                preloaderGone =
                    pStyle.display === 'none' ||
                    pStyle.visibility === 'hidden' ||
                    (!Number.isNaN(opacityVal) && opacityVal <= 0.05);
            }

            // Normal clean startup: wait full 1500ms after Initializing screen disappears
            if (preloaderGone) {
                clearInterval(checkInterval);
                if (preloader) {
                    preloader.inert = true;
                    preloader.setAttribute('aria-hidden', 'true');
                }
                launchOnceReady(STARTUP_SETTLE_DELAY_MS);
                return;
            }

            // Rescue Watchdog: Clear #preloader if iOS Safari stalled jQuery fadeOut AFTER app loaded
            const elapsedMs = Date.now() - bootStartTime;
            const uiPopulated = Boolean(
                chat.children.length > 0 ||
                document.querySelector('.character_select, .group_select, .welcomePanel')
            );

            if ((stAppReadyFired && elapsedMs > 4000) || (uiPopulated && elapsedMs > 12000)) {
                clearInterval(checkInterval);
                console.warn('ST VoiceOver Booster: Dismissed stalled Initializing preloader after UI loaded.');
                hideAndLockPreloader(preloader);
                launchOnceReady(500);
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForSillyTavernReady);
    } else {
        waitForSillyTavernReady();
    }
})();
