<script>
    export let data;
</script>

<div class="container d-flex justify-content-center align-items-center space-grotesk" style="min-height: 80vh;">
    <div class="card shadow border-0" style="max-width: 500px; width: 100%;">
        <div class="card-body p-5 text-center">
            
            {#if data.success}
                <div class="text-success mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor" class="bi bi-check-circle" viewBox="0 0 16 16">
                        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                        <path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/>
                    </svg>
                </div>
                <h3 class="h4 mb-3">E-Mail erfolgreich bestätigt!</h3>
                <p class="text-muted mb-4">Deine neue E-Mail-Adresse wurde erfolgreich in deinem Profil hinterlegt. Du kannst sie ab sofort für den Login nutzen.</p>
            {:else}
                <div class="text-danger mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor" class="bi bi-x-circle" viewBox="0 0 16 16">
                        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                    </svg>
                </div>
                <h3 class="h4 mb-3">Link ungültig</h3>
                <p class="text-muted mb-4">{data.message}</p>
            {/if}

            <a href="/profil" class="btn btn-primary w-100 py-2 fw-bold" style="background: #3b82f6; border: none; border-radius: 6px;">
                Zurück zum Profil
            </a>
            
        </div>
    </div>
</div>

<style>
    .space-grotesk { font-family: 'Space Grotesk', sans-serif; }
    .btn-primary:hover { background: #2563eb !important; }
</style>