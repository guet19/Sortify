<script>
    import TerminalHeader from '$lib/components/TerminalHeader.svelte';
    import { enhance } from '$app/forms';
    import { onDestroy } from 'svelte';
    export let form;
    export let data; 
    
    // Lokale Variablen für die Steuerung
    let currentStep = 1;
    let errorMessage = '';
    let pairingId = null;
    let code1 = '';
    let code2 = '';
    let pollingInterval;

    // Wenn ein Formular abgeschickt wird, übernehmen wir die Daten vom Server
    $: {
        if (form) {
            currentStep = form.step || 1;
            errorMessage = form.error || '';
            if (form.pairingId) pairingId = form.pairingId;
            
            // Felder leeren, wenn der Server einen Fehler wirft
            if (form.error) {
                code1 = '';
                code2 = '';
            }
        }
    }

    // Liste der gekoppelten Terminals – "Weiteres Terminal koppeln" startet die Schritte
    let adding = false;
    let renamingId = null;
    let removing = null;
    $: hasTerminals = data.terminals.length > 0 || data.legacy;
    $: showList = hasTerminals && !adding && currentStep === 1;
    $: identifiedName = form?.identified ? data.terminals.find((t) => t.id === form.identified)?.name : null;
    const seen = (iso) => new Date(iso).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' });
    const afterAction = (done) => () => async ({ update }) => { await update(); done?.(); };

    function startAdding() {
        adding = true;
        currentStep = 1;
        errorMessage = '';
        code1 = '';
    }

    // 🔥 AUTOMATISCHE ÜBERWACHUNG (Polling)
    // Startet, sobald wir in Schritt 2 sind, und stoppt sonst
    $: if (currentStep === 2 && pairingId) {
        startPolling();
    } else {
        stopPolling();
    }

    function startPolling() {
        stopPolling(); // Verhindert doppelte Timer
        pollingInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/pairing-status?id=${pairingId}`);
                const data = await res.json();
                
                // Wenn das Terminal die Zeit abgelaufen ist ODER jemand "Ablehnen" gedrückt hat
                if (data.status === 'waiting_for_web' || data.status === 'cancelled' || data.status === 'not_found') {
                    // 💥 LIVE RÜCKSPRUNG ZU SCHRITT 1
                    currentStep = 1;
                    errorMessage = 'Das Zeitlimit von 5 Minuten wurde überschritten oder der Vorgang wurde am Terminal abgebrochen.';
                    code1 = '';
                    code2 = '';
                    pairingId = null;
                    stopPolling();
                }
            } catch (err) {
                console.error("Fehler beim Abrufen des Status", err);
            }
        }, 2000); // Fragt alle 2 Sekunden nach
    }

    function stopPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
    }

    // Timer sicher aufräumen, wenn die Seite verlassen wird
    onDestroy(() => {
        stopPolling();
    });
</script>

<div class="pairing-page">
<TerminalHeader title="Terminal koppeln" backHref="/terminal/settings" />
<div class="pairing-container">
    <p class="description">
        Verbinde ein Raspberry Pi Terminal sicher mit deinem Sortify-System. 
        Das Terminal erhält dabei einen eigenen Schlüssel und sieht nur die Befehle deines Lagers – keine Datenbank-Zugangsdaten. 
        Ein Lager kann mehrere Terminals haben, z.B. eines pro Regalwand: Jedes steuert die LEDs seiner Regale und hat eine eigene Waage.
    </p>

    {#if !data.mqttReady}
        <div class="error-msg" style="margin-bottom: 16px;">
            Auf dem Server ist noch kein MQTT-Broker eingerichtet (MQTT_HOST usw.). Neue Terminals können gekoppelt werden, erhalten aber erst danach Befehle.
        </div>
    {/if}

    <div class="grid-layout">
        <!-- LINKE SPALTE: Anleitung -->
        <div class="steps-column">
            <h2 class="space-grotesk">Ablauf der Kopplung</h2>
            
            <div class="step {currentStep === 1 && !showList ? 'active' : ''}">
                <div class="step-number">1</div>
                <div class="step-content">
                    <h3>Code ablesen & eingeben</h3>
                    <p>Starte das Raspberry Pi Terminal ohne Konfiguration. Es erscheint ein weißer 8-stelliger Code. Trage diesen hier ein.</p>
                </div>
            </div>

            <div class="step-connector"></div>

            <div class="step {currentStep === 2 ? 'active' : ''}">
                <div class="step-number">2</div>
                <div class="step-content">
                    <h3>Am Terminal bestätigen</h3>
                    <p>Sobald das Gerät gefunden wurde, erscheint auf dem Terminal eine Verbindungsanfrage. Tippe dort auf "Erlauben".</p>
                </div>
            </div>

            <div class="step-connector"></div>

            <div class="step {currentStep === 3 ? 'active' : ''}">
                <div class="step-number">3</div>
                <div class="step-content">
                    <h3>Sicherheits-Code eingeben</h3>
                    <p>Das Terminal generiert nun einen zweiten, grünen Code. Trage diesen hier ein, um die Einrichtung abzuschließen.</p>
                </div>
            </div>
        </div>

        <!-- RECHTE SPALTE: Interaktion -->
        <div class="action-column">
            {#if showList}
                <div class="terminal-list">
                    <h3 class="space-grotesk">Gekoppelte Terminals ({data.terminals.length + (data.legacy ? 1 : 0)})</h3>
                    {#if errorMessage}<div class="error-msg">{errorMessage}</div>{/if}
                    {#if identifiedName}<div class="info-msg" role="status">Die ersten LEDs von „{identifiedName}“ blinken jetzt kurz weiss.</div>{/if}

                    {#each data.terminals as t, i (t.id)}
                        <div class="terminal-row">
                            {#if renamingId === t.id}
                                <form method="POST" action="?/renameTerminal" class="rename-form" use:enhance={afterAction(() => (renamingId = null))}>
                                    <input type="hidden" name="terminalId" value={t.id} />
                                    <input name="name" value={t.name} maxlength="40" class="rename-input" required aria-label="Name des Terminals" />
                                    <div class="row-buttons">
                                        <button type="submit" class="small-btn primary">Speichern</button>
                                        <button type="button" class="small-btn" on:click={() => (renamingId = null)}>Abbrechen</button>
                                    </div>
                                </form>
                            {:else}
                                <div class="terminal-title">
                                    <strong>{t.name}</strong>
                                    {#if i === 0 && data.terminals.length > 1}<span class="tag">Standard</span>{/if}
                                    {#if t.id === data.browserTerminalId}<span class="tag here">dieser Browser</span>{/if}
                                </div>
                                <div class="terminal-meta">
                                    {t.shelves} {t.shelves === 1 ? 'Regal' : 'Regale'} ·
                                    {t.lastSeenAt ? `zuletzt gemeldet ${seen(t.lastSeenAt)}` : 'noch nicht gemeldet'}{t.softwareVersion ? ` · Version ${t.softwareVersion}` : ''}
                                </div>
                                {#if removing === t.id}
                                    <form method="POST" action="?/removeTerminal" class="confirm-remove" use:enhance={afterAction(() => (removing = null))}>
                                        <input type="hidden" name="terminalId" value={t.id} />
                                        <p>„{t.name}“ wirklich entfernen? Das Gerät muss danach neu gekoppelt werden.{t.shelves && data.terminals.length > 1 ? ' Seine Regale gehören dann zum Standard-Terminal.' : ''}</p>
                                        <div class="row-buttons">
                                            <button type="submit" class="small-btn danger">Entfernen</button>
                                            <button type="button" class="small-btn" on:click={() => (removing = null)}>Abbrechen</button>
                                        </div>
                                    </form>
                                {:else}
                                    <div class="row-buttons">
                                        <button type="button" class="small-btn" on:click={() => (renamingId = t.id)}>Umbenennen</button>
                                        <form method="POST" action="?/identifyTerminal" use:enhance>
                                            <input type="hidden" name="terminalId" value={t.id} />
                                            <button type="submit" class="small-btn" title="Die ersten LEDs dieses Terminals blinken kurz weiss">Erkennen</button>
                                        </form>
                                        <button type="button" class="small-btn danger" on:click={() => (removing = t.id)}>Entfernen</button>
                                    </div>
                                {/if}
                            {/if}
                        </div>
                    {/each}

                    {#if data.legacy}
                        <div class="terminal-row">
                            <div class="terminal-title"><strong>Terminal (alte Software)</strong></div>
                            <div class="terminal-meta">Arbeitet noch direkt mit der Datenbank. Bitte auf die aktuelle Terminal-Software umstellen – erst dann sind weitere Terminals möglich.</div>
                            <form method="POST" action="?/removeTerminal" use:enhance>
                                <input type="hidden" name="terminalId" value="legacy" />
                                <button type="submit" class="small-btn danger">Trennen</button>
                            </form>
                        </div>
                    {/if}

                    <div class="action-buttons-row">
                        <a href="/terminal" class="back-link space-grotesk">Zum Terminal</a>
                        {#if data.canAddMore}
                            <button type="button" class="submit-btn add-btn space-grotesk" on:click={startAdding}>+ Weiteres Terminal koppeln</button>
                        {/if}
                    </div>
                </div>

            {:else if currentStep === 1}
                <div class="action-header">
                    <h3>Schritt 1: Initialisierung</h3>
                    <p>Gib den weißen Code vom Terminal-Display ein.</p>
                    {#if hasTerminals}<button type="button" class="link-btn" on:click={() => (adding = false)}>← Zurück zur Liste</button>{/if}
                </div>
                
                <form method="POST" action="?/verifyCode1" use:enhance>
                    <input 
                        type="text" 
                        name="code1" 
                        bind:value={code1}
                        placeholder="--------" 
                        required
                        class="code-input"
                        autocomplete="off"
                    >
                    {#if errorMessage && currentStep === 1}
                        <div class="error-msg">{errorMessage}</div>
                    {/if}
                    <button type="submit" class="submit-btn space-grotesk">Gerät suchen</button>
                </form>

            {:else if currentStep === 2}
                <div class="action-header">
                    <div class="icon-circle">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#60a5fa" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <h3>Gerät gefunden!</h3>
                    <p>Bestätige die Anfrage auf dem Raspberry Pi und gib danach den grünen Code ein.</p>
                </div>
                
                <form method="POST" action="?/verifyCode2" use:enhance>
                    <input type="hidden" name="pairingId" value={pairingId}>
                    <input 
                        type="text" 
                        name="code2" 
                        bind:value={code2}
                        placeholder="Grüner Code" 
                        required
                        class="code-input code-input-green"
                        autocomplete="off"
                    >
                    {#if errorMessage && currentStep === 2}
                        <div class="error-msg">{errorMessage}</div>
                    {/if}
                    <button type="submit" class="submit-btn space-grotesk">Kopplung abschließen</button>
                </form>

            {:else if currentStep === 3}
                <!-- 🔥 NEU: Der fließende Übergang zur Kalibrierung -->
                <div class="success-view">
                    <div class="success-icon">✓</div>
                    <h2 class="space-grotesk">Erfolgreich gekoppelt!</h2>
                    <p style="margin-bottom: 24px;">Das Terminal ist nun sicher mit deinem System verbunden. Damit die Waage korrekte Werte liefert, muss sie vor der ersten Nutzung kalibriert werden.</p>
                    {#if form?.terminalCount > 1}
                        <p class="multi-hint">Dein Lager hat jetzt {form.terminalCount} Terminals. Wähle oben, an welchem dieser Browser steht, und ordne unter „Fächer anlernen“ jedem Regal sein Terminal zu.</p>
                    {/if}
                    
                    <!-- Passe hier den href Pfad an, je nachdem wo deine Kalibrierungs-Seite liegt -->
                    <a href="/terminal/settings/calibration" class="submit-btn space-grotesk" style="display: block; text-decoration: none; box-sizing: border-box; text-align: center;">
                        Jetzt Waage kalibrieren
                    </a>
                </div>
            {/if}
        </div>
    </div>
</div>
</div>

<style>
    /* Das CSS bleibt komplett identisch zu deiner Version! */
    .pairing-page { max-width: 1000px; margin: 0 auto; }
    .pairing-container { padding: 40px; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4); box-sizing: border-box; }
    .description { font-size: 16px; line-height: 1.6; margin: 0 0 32px 0; padding-bottom: 24px; border-bottom: 1px solid #334155; color: #cbd5e1; }
    .grid-layout { display: grid; grid-template-columns: 1fr; gap: 40px; }
    @media (min-width: 768px) { .grid-layout { grid-template-columns: 1fr 1fr; } }
    .steps-column h2 { font-size: 20px; margin: 0 0 24px 0; color: white; }
    .step { display: flex; gap: 16px; align-items: flex-start; opacity: 0.4; transition: opacity 0.3s ease; }
    .step.active { opacity: 1; }
    .step-number { width: 36px; height: 36px; border-radius: 50%; background-color: #334155; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; border: 2px solid #475569; }
    .step.active .step-number { background-color: #22c55e; border-color: #4ade80; box-shadow: 0 0 15px rgba(34, 197, 94, 0.4); }
    .step-content h3 { margin: 0 0 6px 0; font-size: 16px; color: white; }
    .step-content p { margin: 0; font-size: 14px; line-height: 1.5; opacity: 0.7; }
    .step-connector { height: 24px; border-left: 2px dashed #334155; margin-left: 17px; margin-top: 8px; margin-bottom: 8px; }
    .action-column { background-color: #0B192C; padding: 32px; border-radius: 12px; border: 1px solid #334155; display: flex; flex-direction: column; justify-content: center; min-height: 350px; box-sizing: border-box; }
    .action-header { text-align: center; margin-bottom: 24px; }
    .action-header h3 { margin: 0 0 8px 0; font-size: 20px; color: white; }
    .action-header p { margin: 0; font-size: 14px; opacity: 0.7; }
    .icon-circle { width: 48px; height: 48px; border-radius: 50%; background-color: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; }
    form { display: flex; flex-direction: column; gap: 16px; }
    .code-input { width: 100%; padding: 16px; background-color: rgba(0, 0, 0, 0.3); border: 2px solid #334155; border-radius: 8px; color: white; font-family: monospace; font-size: 24px; text-align: center; text-transform: uppercase; letter-spacing: 0.2em; box-sizing: border-box; outline: none; transition: border-color 0.2s; }
    .code-input:focus { border-color: #22c55e; }
    .code-input-green { color: #22c55e; border-color: rgba(34, 197, 94, 0.5); }
    .error-msg { background-color: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; padding: 12px; border-radius: 8px; text-align: center; font-size: 14px; }
    .submit-btn { width: 100%; padding: 16px; background-color: #22c55e; color: #000000; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; transition: opacity 0.2s; }
    .submit-btn:hover { opacity: 0.8; }
    .success-view { text-align: center; padding: 20px 0; }
    .success-icon { width: 80px; height: 80px; border-radius: 50%; border: 2px solid #22c55e; background-color: rgba(34, 197, 94, 0.1); color: #22c55e; font-size: 40px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px auto; }
    .success-view h2 { margin: 0 0 12px 0; color: white; }
    .success-view p { margin: 0 0 32px 0; opacity: 0.7; }
    .action-buttons-row { display: flex; gap: 16px; justify-content: center; margin-top: 24px; }
    .back-link { display: inline-flex; align-items: center; justify-content: center; background-color: #334155; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; transition: background-color 0.2s; }
    .back-link:hover { background-color: #475569; }
    .remove-btn { display: inline-flex; align-items: center; justify-content: center; background-color: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.4); color: #ef4444; padding: 12px 24px; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-size: 16px; }
    .remove-btn:hover { background-color: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.6); }

    /* Liste der Terminals */
    .terminal-list { display: flex; flex-direction: column; gap: 12px; }
    .terminal-list h3 { margin: 0 0 4px 0; color: white; font-size: 20px; }
    .terminal-row { background: #13243b; border: 1px solid #334155; border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
    .terminal-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: white; font-size: 17px; }
    .terminal-meta { color: #94a3b8; font-size: 14px; }
    .tag { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 2px 8px; background: #334155; color: #cbd5e1; }
    .tag.here { background: rgba(34, 197, 94, 0.15); color: #86efac; }
    .row-buttons { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .row-buttons form, .terminal-row form { display: contents; }
    .terminal-row .rename-form, .terminal-row .confirm-remove { display: flex; flex-direction: column; gap: 8px; }
    .confirm-remove p { margin: 0; color: #fecaca; font-size: 14px; }
    .small-btn { background: #1e293b; color: #e2e8f0; border: 1px solid #475569; border-radius: 8px; padding: 8px 14px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
    .small-btn:hover { border-color: #94a3b8; }
    .small-btn.primary { background: #22c55e; border-color: #22c55e; color: #052e16; }
    .small-btn.danger { color: #fca5a5; border-color: rgba(239, 68, 68, 0.5); }
    .small-btn.danger:hover { background: rgba(239, 68, 68, 0.15); }
    .rename-input { padding: 10px 12px; border-radius: 8px; border: 2px solid #334155; background: rgba(0, 0, 0, 0.3); color: white; font-size: 16px; font-family: inherit; }
    .rename-input:focus { border-color: #22c55e; outline: none; }
    .info-msg { background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.4); color: #bfdbfe; padding: 10px 12px; border-radius: 8px; font-size: 14px; }
    .add-btn { width: auto; padding: 12px 20px; }
    .link-btn { margin-top: 10px; background: none; border: none; color: #93c5fd; cursor: pointer; font-family: inherit; font-size: 14px; }
    .multi-hint { background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.4); color: #bfdbfe !important; opacity: 1 !important; padding: 10px 12px; border-radius: 8px; font-size: 14px; }

    /* ===== Smartphone ===== */
    @media (max-width: 640px) {
        .pairing-container { margin: 0; padding: 1.25rem; }
        .grid-layout { gap: 1.5rem; }
        .action-buttons-row { flex-direction: column; }
        .remove-btn { width: 100%; }
    }
</style>