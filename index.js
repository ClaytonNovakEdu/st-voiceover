(function () {
    'use strict';

    // Emergency bypass: adding ?vo=off to the URL disables the script immediately
    if (window.location.search.includes('vo=off')) {
        console.log('ST VoiceOver Booster disabled via URL parameter.');
        return;
    }

    let visibleMessageLimit = 6;
    let lastTotalMessages = 0;
    let lastRenderedHidden = -1;
    let lastRenderedLimit = -1;
    let isRunningEnhancements = false;
    let debounceTimer = null;

    // 1. Inject lightweight CSS for hiding older messages from screen/VoiceOver
    function injectStyles() {
        if (document.getElementById('st-vo-styles')) return;
        const style = document.createElement('style');
        style.id = 'st-vo-styles';
        style.textContent = `
            .st-vo-hidden-mes {
                display: none !important;
            }
            #st-vo-history-controls {
                display: flex;
                gap: 8px;
                padding: 10px;
                justify-content: center;
                background: rgba(0, 0, 0, 0.4);
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                margin-bottom: 6px;
            }
            #st-vo-history-controls button {
                padding: 8px 12px;
                font-size: 14px;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.4);
                background: #2b2b2b;
                color: #ffffff;
            }
        `;
        document.head.appendChild(style);
    }

    // 2. Spoken labels for specific SillyTavern button IDs
    const ID_LABELS = {
        'send_but': 'Send Message',
        'options_button': 'Chat Actions Menu (New Chat, Author Note, Regenerate)',
        'extensionsMenuButton': 'Extensions Quick Menu',
        'mes_stop': 'Stop Generating Response',
        'ai-config-button': 'AI Response Sliders and Presets Menu',
        'sys-settings-button': 'API Connections Menu',
        'WI-SP-button': 'World Info and Lorebooks Menu',
        'user-settings-button': 'User Settings Menu',
        'logo_block': 'Backgrounds Menu',
        'extensions-settings-button': 'Extensions Menu',
        'persona-management-button': 'Persona Management Menu',
        'rightNavHolder': 'Character Management Menu',
        'rightNavDrawerIcon': 'Character Management Menu',
        'back_to_characters': 'Back to Character List',
        'create_button': 'Create New Character',
        'delete_button': 'Delete Character',
        'duplicate_button': 'Duplicate Character',
        'export_button': 'Export or Download Character',
        'character_import_button': 'Import or Upload Character',
        'external_import_button': 'Import Character from URL',
        'favorite_button': 'Favorite Character',
        'rename_button': 'Rename Character',
        'convert_to_persona': 'Convert Character to Persona',
        'option_start_new_chat': 'Start New Chat',
        'option_select_chat': 'Switch or Manage Saved Chats',
        'option_toggle_AN': 'Author Note',
        'option_delete_mes': 'Delete Messages',
        'option_regenerate': 'Regenerate Last Response',
        'option_impersonate': 'Impersonate (Have AI write for you)',
        'option_continue': 'Continue Generating Message',
        'update_preset': 'Save and Update Current Preset',
        'new_preset': 'Save as New Preset',
        'import_preset': 'Import Preset',
        'export_preset': 'Export Preset',
        'delete_preset': 'Delete Current Preset',
        'restore_default_preset': 'Restore Default Preset'
    };

    // 3. Spoken labels for FontAwesome icon classes
    const ICON_LABELS = [
        ['fa-paper-plane', 'Send Message'],
        ['fa-bars', 'Options Menu'],
        ['fa-magic', 'Extensions Menu'],
        ['fa-wand-magic-sparkles', 'Extensions Menu'],
        ['fa-sliders', 'Sliders and Prompt Settings'],
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
        ['fa-trash-can', 'Delete'],
        ['fa-trash', 'Delete'],
        ['fa-pen-to-square', 'Edit'],
        ['fa-pencil', 'Edit'],
        ['fa-pen', 'Edit or Rename'],
        ['fa-copy', 'Duplicate or Copy'],
        ['fa-clone', 'Duplicate'],
        ['fa-file-export', 'Export or Download'],
        ['fa-download', 'Download'],
        ['fa-file-import', 'Import or Upload'],
        ['fa-upload', 'Upload'],
        ['fa-cloud-arrow-up', 'Upload'],
        ['fa-file-arrow-up', 'Import File'],
        ['fa-file-arrow-down', 'Export File'],
        ['fa-plus', 'Add or Create New'],
        ['fa-folder-plus', 'Create New'],
        ['fa-user-plus', 'Create New Character'],
        ['fa-floppy-disk', 'Save'],
        ['fa-save', 'Save'],
        ['fa-rotate-left', 'Restore or Undo'],
        ['fa-undo', 'Undo'],
        ['fa-rotate-right', 'Regenerate or Refresh'],
        ['fa-arrows-rotate', 'Refresh'],
        ['fa-sync', 'Refresh'],
        ['fa-star', 'Favorite'],
        ['fa-check', 'Confirm'],
        ['fa-xmark', 'Close or Cancel'],
        ['fa-times', 'Close or Cancel'],
        ['fa-chevron-left', 'Previous or Back'],
        ['fa-chevron-right', 'Next'],
        ['fa-arrow-left', 'Back'],
        ['fa-arrow-right', 'Forward'],
        ['fa-unlink', 'Remove or Unlink'],
        ['fa-link', 'Link'],
        ['fa-eye-slash', 'Hide'],
        ['fa-eye', 'Show'],
        ['fa-lock', 'Locked'],
        ['fa-unlock', 'Unlocked'],
        ['fa-volume-high', 'Read Aloud'],
        ['fa-comments', 'Chat History']
    ];

    // 4. Close the keyboard / unfocus text box when pressing Send
    function setupSendBlurFix() {
        const blurTextarea = () => {
            const ta = document.getElementById('send_textarea');
            if (ta) {
                ta.blur();
                setTimeout(() => ta.blur(), 50);
                setTimeout(() => ta.blur(), 180);
            }
        };

        document.addEventListener('click', (e) => {
            if (e.target && e.target.closest && e.target.closest('#send_but')) {
                blurTextarea();
            }
        }, true);
    }

    // 5. Isolate background chat from VoiceOver when a menu drawer is open
    function updateMenuIsolation() {
        const allDrawerContents = document.querySelectorAll('.drawer-content');
        let anyDrawerOpen = false;

        allDrawerContents.forEach(drawer => {
            const isOpen = drawer.classList.contains('openDrawer') && drawer.offsetParent !== null;
            if (isOpen) {
                anyDrawerOpen = true;
                if (drawer.getAttribute('aria-hidden') !== 'false') {
                    drawer.setAttribute('aria-hidden', 'false');
                }
            } else {
                if (drawer.getAttribute('aria-hidden') !== 'true') {
                    drawer.setAttribute('aria-hidden', 'true');
                }
            }
        });

        const sheld = document.getElementById('sheld');
        if (sheld) {
            if (anyDrawerOpen) {
                if (sheld.getAttribute('aria-hidden') !== 'true') {
                    sheld.setAttribute('aria-hidden', 'true');
                }
            } else {
                if (sheld.hasAttribute('aria-hidden')) {
                    sheld.removeAttribute('aria-hidden');
                }
            }
        }
    }

    // 6. Keep only latest 6 messages visible on screen to eliminate VoiceOver lag
    function updateChatLagLimiter() {
        const chat = document.getElementById('chat');
        if (!chat) return;

        const messages = Array.from(chat.querySelectorAll(':scope > .mes'));
        const total = messages.length;

        if (Math.abs(total - lastTotalMessages) > 3 && total <= 6) {
            visibleMessageLimit = 6;
        }
        lastTotalMessages = total;

        const hiddenCount = Math.max(0, total - visibleMessageLimit);
        let controls = document.getElementById('st-vo-history-controls');

        if (total > 6) {
            if (!controls) {
                controls = document.createElement('div');
                controls.id = 'st-vo-history-controls';
                chat.prepend(controls);
                lastRenderedHidden = -1;
            }

            // Only update the buttons when counts actually change (prevents loops)
            if (lastRenderedHidden !== hiddenCount || lastRenderedLimit !== visibleMessageLimit) {
                lastRenderedHidden = hiddenCount;
                lastRenderedLimit = visibleMessageLimit;
                controls.innerHTML = '';

                if (hiddenCount > 0) {
                    const showMoreBtn = document.createElement('button');
                    showMoreBtn.type = 'button';
                    showMoreBtn.textContent = `Show 6 Older Messages (${hiddenCount} hidden for speed)`;
                    showMoreBtn.addEventListener('click', () => {
                        visibleMessageLimit += 6;
                        scheduleEnhancements(20);
                    });
                    controls.appendChild(showMoreBtn);
                }

                if (visibleMessageLimit > 6) {
                    const resetBtn = document.createElement('button');
                    resetBtn.type = 'button';
                    resetBtn.textContent = 'Hide Older Messages (Boost VoiceOver Speed)';
                    resetBtn.addEventListener('click', () => {
                        visibleMessageLimit = 6;
                        scheduleEnhancements(20);
                    });
                    controls.appendChild(resetBtn);
                }
            }
        } else if (controls) {
            controls.remove();
            lastRenderedHidden = -1;
        }

        messages.forEach((mes, index) => {
            const shouldHide = index < total - visibleMessageLimit;
            if (shouldHide) {
                if (!mes.classList.contains('st-vo-hidden-mes')) {
                    mes.classList.add('st-vo-hidden-mes');
                    mes.setAttribute('aria-hidden', 'true');
                }
            } else {
                if (mes.classList.contains('st-vo-hidden-mes')) {
                    mes.classList.remove('st-vo-hidden-mes');
                    mes.removeAttribute('aria-hidden');
                }
                enhanceSingleMessage(mes);
            }
        });
    }

    // 7. Label individual chat messages, character headings, and swipe/edit buttons
    function enhanceSingleMessage(mes) {
        if (mes.getAttribute('data-vo-mes-ready') === '1') return;

        const nameEl = mes.querySelector('.ch_name');
        const charName = nameEl ? nameEl.textContent.trim() : 'Character';
        if (!charName) return;

        if (nameEl) {
            nameEl.setAttribute('role', 'heading');
            nameEl.setAttribute('aria-level', '3');
        }

        const msgButtonMap = [
            ['.swipe_left', `Previous Swipe for ${charName}`],
            ['.swipe_right', `Next Swipe or Generate New Reply for ${charName}`],
            ['.mes_edit', `Edit Message from ${charName}`],
            ['.mes_edit_done', 'Save Edited Message'],
            ['.mes_edit_cancel', 'Cancel Editing Message'],
            ['.mes_edit_delete', 'Delete This Message'],
            ['.mes_edit_copy', 'Copy Message Text'],
            ['.mes_copy', `Copy Message from ${charName}`],
            ['.mes_bookmark', 'Bookmark Message'],
            ['.mes_narrate', `Read Aloud Message from ${charName}`],
            ['.extraMesButtonsHint', `More Message Actions for ${charName}`]
        ];

        msgButtonMap.forEach(([selector, label]) => {
            const btn = mes.querySelector(selector);
            if (btn) makeAccessibleButton(btn, label);
        });

        const avatar = mes.querySelector('.avatar');
        if (avatar) avatar.setAttribute('aria-hidden', 'true');

        mes.setAttribute('data-vo-mes-ready', '1');
    }

    // 8. Label Prompt Manager switches, Edit buttons, and Remove buttons
    function enhancePromptManager() {
        const promptRows = document.querySelectorAll('.completion_prompt_manager_prompt, .world_entry');

        promptRows.forEach(row => {
            const nameNode = row.querySelector(
                '.completion_prompt_manager_prompt_name, .world_entry_name, a, span'
            );
            const promptName = nameNode ? nameNode.textContent.trim() : 'Prompt';
            if (!promptName) return;

            const toggleBtn = row.querySelector(
                '.prompt_manager_prompt_toggle, .fa-toggle-on, .fa-toggle-off, .killSwitch'
            );
            if (toggleBtn) {
                const isOff =
                    row.classList.contains('completion_prompt_manager_prompt_disabled') ||
                    toggleBtn.classList.contains('fa-toggle-off') ||
                    !!toggleBtn.querySelector('.fa-toggle-off');
                const isOn = !isOff;
                const desiredLabel = `${promptName}: ${isOn ? 'On' : 'Off'}`;

                if (toggleBtn.getAttribute('aria-label') !== desiredLabel) {
                    toggleBtn.setAttribute('role', 'switch');
                    toggleBtn.setAttribute('tabindex', '0');
                    toggleBtn.setAttribute('aria-checked', isOn ? 'true' : 'false');
                    toggleBtn.setAttribute('aria-label', desiredLabel);
                }
            }

            const editBtn = row.querySelector(
                '.prompt_manager_prompt_edit, .fa-pencil, .fa-pen-to-square, .fa-pen'
            );
            if (editBtn) {
                const target = editBtn.closest('a, span, button, div.menu_button') || editBtn;
                makeAccessibleButton(target, `Edit Prompt: ${promptName}`);
            }

            const delBtn = row.querySelector(
                '.prompt_manager_prompt_delete, .fa-trash, .fa-trash-can, .fa-unlink, .fa-xmark'
            );
            if (delBtn) {
                const target = delBtn.closest('a, span, button, div.menu_button') || delBtn;
                makeAccessibleButton(target, `Remove Prompt: ${promptName}`);
            }
        });
    }

    // 9. Helper to convert div/span icons into proper VoiceOver buttons
    function makeAccessibleButton(el, label) {
        if (!el || !label) return;
        if (el.getAttribute('aria-label') !== label) {
            el.setAttribute('aria-label', label);
        }
        const tag = el.tagName.toLowerCase();
        if (tag !== 'button' && tag !== 'input' && tag !== 'select' && tag !== 'textarea' && !el.getAttribute('role')) {
            el.setAttribute('role', 'button');
        }
        if (!el.hasAttribute('tabindex') && tag !== 'button' && tag !== 'input') {
            el.setAttribute('tabindex', '0');
        }
    }

    function inferLabelFromIcons(el) {
        const classStr = [
            el.className || '',
            ...Array.from(el.querySelectorAll('i, span')).map(c => c.className || '')
        ].join(' ');

        for (const [iconClass, spokenLabel] of ICON_LABELS) {
            if (classStr.includes(iconClass)) {
                return spokenLabel;
            }
        }
        return null;
    }

    // 10. Label top bar icons, tooltips, and character cards
    function labelAllControls() {
        Object.entries(ID_LABELS).forEach(([id, label]) => {
            const el = document.getElementById(id);
            if (el) makeAccessibleButton(el, label);
        });

        document.querySelectorAll('.drawer').forEach((drawer, idx) => {
            const toggle = drawer.querySelector('.drawer-toggle');
            const icon = drawer.querySelector('.drawer-icon');
            const content = drawer.querySelector('.drawer-content');
            const isOpen = Boolean(content && content.classList.contains('openDrawer'));
            const target = icon || toggle;

            if (target) {
                let baseLabel =
                    target.getAttribute('data-st-vo-base') ||
                    ID_LABELS[target.id] ||
                    ID_LABELS[drawer.id] ||
                    target.getAttribute('title') ||
                    (toggle && toggle.getAttribute('title')) ||
                    inferLabelFromIcons(target) ||
                    `Top Menu ${idx + 1}`;

                target.setAttribute('data-st-vo-base', baseLabel);
                makeAccessibleButton(target, `${baseLabel} (${isOpen ? 'Expanded' : 'Collapsed'})`);
                target.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            }
        });

        document.querySelectorAll('[title]:not([data-vo-titled="1"])').forEach(el => {
            el.setAttribute('data-vo-titled', '1');
            const titleText = (el.getAttribute('title') || '').trim();
            if (!titleText || el.getAttribute('role') === 'switch') return;
            if (!el.getAttribute('aria-label')) {
                makeAccessibleButton(el, titleText);
            }
        });

        document.querySelectorAll('.menu_button:not([data-vo-btn="1"])').forEach(el => {
            el.setAttribute('data-vo-btn', '1');
            if (el.getAttribute('aria-label') || el.getAttribute('role') === 'switch') return;
            const text = el.textContent ? el.textContent.trim() : '';
            if (text.length > 1) return;
            const inferred = inferLabelFromIcons(el);
            if (inferred) makeAccessibleButton(el, inferred);
        });

        document.querySelectorAll('.character_select:not([data-vo-char="1"]), .group_select:not([data-vo-char="1"])').forEach(card => {
            const nameEl = card.querySelector('.ch_name');
            if (nameEl && nameEl.textContent.trim()) {
                card.setAttribute('data-vo-char', '1');
                makeAccessibleButton(card, `Select Character: ${nameEl.textContent.trim()}`);
            }
        });
    }

    // 11. Safe runner that pauses during AI streaming and prevents recursion
    function runAllEnhancements() {
        if (isRunningEnhancements) return;
        isRunningEnhancements = true;
        try {
            updateMenuIsolation();
            updateChatLagLimiter();
            enhancePromptManager();
            labelAllControls();
        } catch (err) {
            console.warn('ST VoiceOver Booster non-fatal error:', err);
        } finally {
            isRunningEnhancements = false;
        }
    }

    function scheduleEnhancements(delay = 200) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            // Skip heavy scans while AI is actively streaming words
            const stopBtn = document.getElementById('mes_stop');
            if (stopBtn && stopBtn.offsetParent !== null && window.getComputedStyle(stopBtn).display !== 'none') {
                updateChatLagLimiter();
                return;
            }
            window.requestAnimationFrame(runAllEnhancements);
        }, delay);
    }

    // 12. Wait until SillyTavern has 100% finished "Initializing..." before starting
    function waitForSillyTavernReady() {
        const checkInterval = setInterval(() => {
            const preloader = document.getElementById('preloader');
            const chat = document.getElementById('chat');
            const sendTa = document.getElementById('send_textarea');

            const preloaderGone = !preloader || window.getComputedStyle(preloader).display === 'none';

            if (preloaderGone && chat && sendTa) {
                clearInterval(checkInterval);
                // Wait an extra 1.5 seconds after startup finishes so settings settle safely
                setTimeout(startExtension, 1500);
            }
        }, 500);
    }

    function startExtension() {
        injectStyles();
        setupSendBlurFix();
        runAllEnhancements();

        // Only watch #chat for new messages added/removed (cannot trigger infinite loops)
        const chat = document.getElementById('chat');
        if (chat) {
            const chatObserver = new MutationObserver(() => {
                if (!isRunningEnhancements) {
                    scheduleEnhancements(150);
                }
            });
            chatObserver.observe(chat, { childList: true });
        }

        // Refresh labels and menu isolation whenever you tap a button or switch
        document.addEventListener('click', () => {
            scheduleEnhancements(120);
            setTimeout(() => scheduleEnhancements(350), 350);
        }, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForSillyTavernReady);
    } else {
        waitForSillyTavernReady();
    }
})();
