(function () {
    'use strict';

    // Number of recent messages kept visible on screen by default to prevent VoiceOver lag
    let visibleMessageLimit = 6;
    let lastTotalMessages = 0;

    // 1. Inject CSS for hiding older messages cleanly without deleting them from AI memory
    const style = document.createElement('style');
    style.textContent = `
        .st-vo-hidden-mes {
            display: none !important;
        }
        .st-vo-bg-isolated {
            visibility: hidden !important;
            pointer-events: none !important;
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

    // 2. Dictionary of common SillyTavern IDs and their spoken VoiceOver labels
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

    // 3. Dictionary of FontAwesome icon classes for fallback labeling
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

    // 4. Stop text box from popping back up when pressing Send
    function setupSendBlurFix() {
        const blurTextarea = () => {
            const ta = document.getElementById('send_textarea');
            if (ta) {
                ta.blur();
                setTimeout(() => ta.blur(), 30);
                setTimeout(() => ta.blur(), 120);
                setTimeout(() => ta.blur(), 300);
            }
        };

        document.addEventListener('click', (e) => {
            const sendBtn = e.target.closest('#send_but');
            if (sendBtn) {
                blurTextarea();
            }
        }, true);

        document.addEventListener('keydown', (e) => {
            if (e.target && e.target.id === 'send_textarea' && e.key === 'Enter' && !e.shiftKey) {
                setTimeout(blurTextarea, 20);
            }
        }, true);
    }

    // 5. Isolate Background Chat when ANY Menu or Popup is Open
    function updateMenuIsolation() {
        const openDrawers = Array.from(document.querySelectorAll('.drawer-content.openDrawer')).filter(
            el => el.offsetParent !== null && window.getComputedStyle(el).display !== 'none'
        );

        const openPopups = Array.from(document.querySelectorAll('.popup, .dialogue_popup, #shadow_popup')).filter(
            el => el.offsetParent !== null && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el). opacity !== '0'
        );

        const sheld = document.getElementById('sheld');
        const allDrawerContents = document.querySelectorAll('.drawer-content');

        // Hide closed drawers from VoiceOver so they never trap focus
        allDrawerContents.forEach(drawer => {
            const isOpen = openDrawers.includes(drawer);
            if (isOpen) {
                drawer.setAttribute('aria-hidden', 'false');
                drawer.removeAttribute('inert');
            } else {
                drawer.setAttribute('aria-hidden', 'true');
                drawer.setAttribute('inert', '');
            }
        });

        // If any menu drawer or popup is open, completely hide the background chat from VoiceOver touch exploration
        if (sheld) {
            if (openDrawers.length > 0 || openPopups.length > 0) {
                sheld.setAttribute('aria-hidden', 'true');
                sheld.setAttribute('inert', '');
                sheld.classList.add('st-vo-bg-isolated');
            } else {
                sheld.setAttribute('aria-hidden', 'false');
                sheld.removeAttribute('inert');
                sheld.classList.remove('st-vo-bg-isolated');
            }
        }
    }

    // 6. Limit visible messages in long chats to eliminate VoiceOver lag
    function updateChatLagLimiter() {
        const chat = document.getElementById('chat');
        if (!chat) return;

        const messages = Array.from(chat.querySelectorAll('.mes'));
        const total = messages.length;

        // Reset limit to 6 whenever switching to a different chat
        if (Math.abs(total - lastTotalMessages) > 3 && total <= 6) {
            visibleMessageLimit = 6;
        }
        lastTotalMessages = total;

        let controls = document.getElementById('st-vo-history-controls');
        const hiddenCount = Math.max(0, total - visibleMessageLimit);

        if (total > 6) {
            if (!controls) {
                controls = document.createElement('div');
                controls.id = 'st-vo-history-controls';
                chat.prepend(controls);
            } else if (chat.firstElementChild !== controls) {
                chat.prepend(controls);
            }

            controls.innerHTML = '';

            if (hiddenCount > 0) {
                const showMoreBtn = document.createElement('button');
                showMoreBtn.type = 'button';
                showMoreBtn.textContent = `Show 6 Older Messages (${hiddenCount} hidden for speed)`;
                showMoreBtn.addEventListener('click', () => {
                    visibleMessageLimit += 6;
                    updateChatLagLimiter();
                });
                controls.appendChild(showMoreBtn);
            }

            if (visibleMessageLimit > 6) {
                const resetBtn = document.createElement('button');
                resetBtn.type = 'button';
                resetBtn.textContent = 'Hide Older Messages (Boost VoiceOver Speed)';
                resetBtn.addEventListener('click', () => {
                    visibleMessageLimit = 6;
                    updateChatLagLimiter();
                });
                controls.appendChild(resetBtn);
            }
        } else if (controls) {
            controls.remove();
        }

        messages.forEach((mes, index) => {
            const shouldHide = index < total - visibleMessageLimit;
            if (shouldHide) {
                mes.classList.add('st-vo-hidden-mes');
                mes.setAttribute('aria-hidden', 'true');
            } else {
                mes.classList.remove('st-vo-hidden-mes');
                mes.removeAttribute('aria-hidden');
                enhanceSingleMessage(mes);
            }
        });
    }

    // 7. Label individual chat messages, headings, and swipe/edit buttons
    function enhanceSingleMessage(mes) {
        const nameEl = mes.querySelector('.ch_name');
        const charName = nameEl ? nameEl.textContent.trim() : 'Character';

        // Make character name a Heading Level 3 for easy VoiceOver Rotor navigation
        if (nameEl && nameEl.getAttribute('role') !== 'heading') {
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
            ['.mes_edit_up', 'Move Message Up'],
            ['.mes_edit_down', 'Move Message Down'],
            ['.mes_copy', `Copy Message from ${charName}`],
            ['.mes_bookmark', 'Bookmark Message'],
            ['.mes_narrate', `Read Aloud Message from ${charName}`],
            ['.extraMesButtonsHint', `More Message Actions for ${charName}`]
        ];

        msgButtonMap.forEach(([selector, label]) => {
            const btn = mes.querySelector(selector);
            if (btn) {
                makeAccessibleButton(btn, label);
            }
        });

        // Hide decorative avatar images from cluttering VoiceOver swiping
        const avatar = mes.querySelector('.avatar');
        if (avatar) {
            avatar.setAttribute('aria-hidden', 'true');
        }
    }

    // 8. Fix Prompt Manager (Toggles, Edit, Remove) & Presets
    function enhancePromptManager() {
        const promptRows = document.querySelectorAll('.completion_prompt_manager_prompt, .world_entry, .regex-script-label');

        promptRows.forEach(row => {
            const nameNode = row.querySelector(
                '.completion_prompt_manager_prompt_name, .world_entry_name, .regex_script_name, a, span'
            );
            const promptName = nameNode ? nameNode.textContent.trim() : 'Prompt';

            // Find toggle switches on this row
            const toggleBtn = row.querySelector(
                '.prompt_manager_prompt_toggle, .fa-toggle-on, .fa-toggle-off, .killSwitch'
            );
            if (toggleBtn) {
                const isOff =
                    row.classList.contains('completion_prompt_manager_prompt_disabled') ||
                    toggleBtn.classList.contains('fa-toggle-off') ||
                    !!toggleBtn.querySelector('.fa-toggle-off');
                const isOn = !isOff;

                toggleBtn.setAttribute('role', 'switch');
                toggleBtn.setAttribute('tabindex', '0');
                toggleBtn.setAttribute('aria-checked', isOn ? 'true' : 'false');
                toggleBtn.setAttribute('aria-label', `${promptName}: ${isOn ? 'On' : 'Off'}`);
            }

            // Find Edit / Inspect button on this row
            const editBtn = row.querySelector(
                '.prompt_manager_prompt_edit, .fa-pencil, .fa-pen-to-square, .fa-pen'
            );
            if (editBtn) {
                const target = editBtn.closest('a, span, button, div.menu_button') || editBtn;
                makeAccessibleButton(target, `Edit Prompt: ${promptName}`);
            }

            // Find Delete / Unlink / Remove button on this row
            const delBtn = row.querySelector(
                '.prompt_manager_prompt_delete, .fa-trash, .fa-trash-can, .fa-unlink, .fa-xmark'
            );
            if (delBtn) {
                const target = delBtn.closest('a, span, button, div.menu_button') || delBtn;
                makeAccessibleButton(target, `Remove Prompt: ${promptName}`);
            }
        });
    }

    // 9. Helper to turn fake div/span icons into real VoiceOver buttons
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

    // 10. Scan and label all icons, tooltips, and top-bar menus across SillyTavern
    function labelAllControls() {
        // A. Label by specific known IDs
        Object.entries(ID_LABELS).forEach(([id, label]) => {
            const el = document.getElementById(id);
            if (el) {
                makeAccessibleButton(el, label);
            }
        });

        // B. Label Top Bar Drawer Toggles and include Open/Closed state
        document.querySelectorAll('.drawer').forEach((drawer, idx) => {
            const toggle = drawer.querySelector('.drawer-toggle');
            const icon = drawer.querySelector('.drawer-icon');
            const content = drawer.querySelector('.drawer-content');
            const isOpen = content && content.classList.contains('openDrawer');
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

        // C. Convert hidden mouse tooltips ([title]) into spoken VoiceOver labels
        document.querySelectorAll('[title]').forEach(el => {
            const titleText = el.getAttribute('title').trim();
            if (!titleText) return;
            // Don't overwrite Prompt Manager switches that have dynamic On/Off labels
            if (el.getAttribute('role') === 'switch') return;

            if (!el.getAttribute('aria-label')) {
                makeAccessibleButton(el, titleText);
            }
        });

        // D. Label unlabeled menu buttons and FontAwesome icons
        document.querySelectorAll('.menu_button, .fa-solid, .fa-regular, .fas, .far, .fa').forEach(el => {
            // Skip icons that are already inside a properly labeled button
            const parentLabeled = el.parentElement && el.parentElement.closest('[aria-label], button');
            if (parentLabeled && parentLabeled !== el && parentLabeled.getAttribute('aria-label')) {
                el.setAttribute('aria-hidden', 'true');
                return;
            }

            if (el.getAttribute('aria-label') || el.getAttribute('role') === 'switch') return;

            const text = el.textContent ? el.textContent.trim() : '';
            if (text.length > 1) return; // Already has visible text for VoiceOver to read

            const inferred = inferLabelFromIcons(el);
            if (inferred) {
                const interactiveTarget = el.closest('.menu_button, a, button') || el;
                makeAccessibleButton(interactiveTarget, inferred);
            }
        });

        // E. Label Character Cards in the Character List
        document.querySelectorAll('.character_select, .group_select').forEach(card => {
            const nameEl = card.querySelector('.ch_name');
            if (nameEl) {
                const name = nameEl.textContent.trim();
                if (name) {
                    makeAccessibleButton(card, `Select Character: ${name}`);
                }
            }
        });
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

    // 11. Run all fixes automatically and watch for screen changes
    function runAllEnhancements() {
        updateMenuIsolation();
        updateChatLagLimiter();
        enhancePromptManager();
        labelAllControls();
    }

    let debounceTimer = null;
    function scheduleEnhancements() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runAllEnhancements, 120);
    }

    function init() {
        setupSendBlurFix();
        runAllEnhancements();

        // Watch for new messages, opened menus, or Prompt Manager updates
        const observer = new MutationObserver(() => {
            scheduleEnhancements();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'title']
        });

        // Re-check immediately after any tap/click (e.g., toggling a prompt switch or opening a menu)
        document.addEventListener('click', () => {
            setTimeout(runAllEnhancements, 60);
            setTimeout(runAllEnhancements, 250);
        }, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
