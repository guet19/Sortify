<script>
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

    $: isAlreadyPaired = data.isPaired && currentStep !== 3;

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

<div class="pairing-container">
    <div class="header-section">
        <h1 class="space-grotesk">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"/>
            </svg>
            Terminal koppeln
        </h1>
        <p class="description">
            Verbinde ein neues Raspberry Pi Terminal sicher mit deinem Sortify-System. 
            Dieser Prozess garantiert, dass nur autorisierte Geräte Zugriff auf deine Datenbank erhalten. 
            Folge einfach den Schritten hier und auf dem Display deines Terminals.
        </p>
    </div>

    <div class="grid-layout">
        <!-- LINKE SPALTE: Anleitung -->
        <div class="steps-column">
            <h2 class="space-grotesk">Ablauf der Kopplung</h2>
            
            <div class="step {currentStep === 1 && !isAlreadyPaired ? 'active' : ''}">
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

            <div class="step {currentStep === 3 || isAlreadyPaired ? 'active' : ''}">
                <div class="step-number">3</div>
                <div class="step-content">
                    <h3>Sicherheits-Code eingeben</h3>
                    <p>Das Terminal generiert nun einen zweiten, grünen Code. Trage diesen hier ein, um die Einrichtung abzuschließen.</p>
                </div>
            </div>
        </div>

        <!-- RECHTE SPALTE: Interaktion -->
        <div class="action-column">
            {#if isAlreadyPaired}
                <div class="success-view">
                    <div class="success-icon" style="border-color: #3b82f6; background-color: rgba(59, 130, 246, 0.1); color: #3b82f6;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 class="space-grotesk" style="color: #3b82f6;">Terminal verbunden</h2>
                    <p>Dein System ist bereits erfolgreich mit einem Raspberry Pi gekoppelt. Aus Sicherheitsgründen kann immer nur ein Terminal gleichzeitig verbunden sein.</p>
                    
                    <div class="action-buttons-row">
                        <a href="/terminal" class="back-link space-grotesk">Zum Terminal</a>
                        <form method="POST" action="?/removeTerminal" use:enhance>
                            <button type="submit" class="remove-btn space-grotesk">Terminal trennen</button>
                        </form>
                    </div>
                </div>

            {:else if currentStep === 1}
                <div class="action-header">
                    <h3>Schritt 1: Initialisierung</h3>
                    <p>Gib den weißen Code vom Terminal-Display ein.</p>
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
                    
                    <!-- Passe hier den href Pfad an, je nachdem wo deine Kalibrierungs-Seite liegt -->
                    <a href="/terminal/settings/calibration" class="submit-btn space-grotesk" style="display: block; text-decoration: none; box-sizing: border-box; text-align: center;">
                        Jetzt Waage kalibrieren
                    </a>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    /* Das CSS bleibt komplett identisch zu deiner Version! */
    .pairing-container { max-width: 1000px; margin: 40px auto; padding: 40px; background-color: #112238; border: 1px solid #1e3a5f; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4); box-sizing: border-box; }
    .header-section { margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid #1e3a5f; }
    .header-section h1 { font-size: 28px; margin: 0 0 16px 0; display: flex; align-items: center; gap: 12px; }
    .description { font-size: 16px; line-height: 1.6; margin: 0; max-width: 800px; opacity: 0.7; }
    .grid-layout { display: grid; grid-template-columns: 1fr; gap: 40px; }
    @media (min-width: 768px) { .grid-layout { grid-template-columns: 1fr 1fr; } }
    .steps-column h2 { font-size: 20px; margin: 0 0 24px 0; color: white; }
    .step { display: flex; gap: 16px; align-items: flex-start; opacity: 0.4; transition: opacity 0.3s ease; }
    .step.active { opacity: 1; }
    .step-number { width: 36px; height: 36px; border-radius: 50%; background-color: #1e3a5f; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; border: 2px solid #2a4b7a; }
    .step.active .step-number { background-color: #22c55e; border-color: #4ade80; box-shadow: 0 0 15px rgba(34, 197, 94, 0.4); }
    .step-content h3 { margin: 0 0 6px 0; font-size: 16px; color: white; }
    .step-content p { margin: 0; font-size: 14px; line-height: 1.5; opacity: 0.7; }
    .step-connector { height: 24px; border-left: 2px dashed #1e3a5f; margin-left: 17px; margin-top: 8px; margin-bottom: 8px; }
    .action-column { background-color: #0B192C; padding: 32px; border-radius: 12px; border: 1px solid #1e3a5f; display: flex; flex-direction: column; justify-content: center; min-height: 350px; box-sizing: border-box; }
    .action-header { text-align: center; margin-bottom: 24px; }
    .action-header h3 { margin: 0 0 8px 0; font-size: 20px; color: white; }
    .action-header p { margin: 0; font-size: 14px; opacity: 0.7; }
    .icon-circle { width: 48px; height: 48px; border-radius: 50%; background-color: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; }
    form { display: flex; flex-direction: column; gap: 16px; }
    .code-input { width: 100%; padding: 16px; background-color: rgba(0, 0, 0, 0.3); border: 2px solid #1e3a5f; border-radius: 8px; color: white; font-family: monospace; font-size: 24px; text-align: center; text-transform: uppercase; letter-spacing: 0.2em; box-sizing: border-box; outline: none; transition: border-color 0.2s; }
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
    .back-link { display: inline-flex; align-items: center; justify-content: center; background-color: #1e3a5f; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; transition: background-color 0.2s; }
    .back-link:hover { background-color: #2a4b7a; }
    .remove-btn { display: inline-flex; align-items: center; justify-content: center; background-color: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.4); color: #ef4444; padding: 12px 24px; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-size: 16px; }
    .remove-btn:hover { background-color: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.6); }
</style>