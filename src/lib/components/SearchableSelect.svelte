<!-- src/lib/components/SearchableSelect.svelte -->
<script>
    export let options = [];
    export let value = "";
    export let name = "";
    export let placeholder = "Bitte wählen oder suchen...";
    export let multiple = false;

    $: if (multiple && !Array.isArray(value)) {
        value = value ? [value] : [];
    }

    let searchTerm = "";
    let isOpen = false;

    $: {
        if (!isOpen) {
            if (multiple) {
                searchTerm =
                    Array.isArray(value) && value.length > 0
                        ? value.join(", ")
                        : "";
            } else {
                const selected = options.find((opt) => opt.value === value);
                searchTerm = selected ? selected.label : "";
            }
        }
    }

    $: sortedOptions = [...options].sort((a, b) =>
        a.label.localeCompare(b.label, "de", { sensitivity: "base" }),
    );

    $: filteredOptions = sortedOptions.filter((opt) => {
        if (multiple && !isOpen) return true;

        if (!multiple) {
            const currentSelected = options.find((o) => o.value === value);
            if (currentSelected && searchTerm === currentSelected.label)
                return true;
        }
        return opt.label.toLowerCase().includes(searchTerm.toLowerCase());
    });

    function selectOption(opt) {
        if (multiple) {
            if (value.includes(opt.value)) {
                value = value.filter((v) => v !== opt.value);
            } else {
                value = [...value, opt.value];
            }
        } else {
            value = opt.value;
            searchTerm = opt.label;
            isOpen = false;
        }
    }

    function handleFocus(event) {
        isOpen = true;
        if (multiple) {
            searchTerm = "";
        } else {
            event.target.select();
        }
    }

    function handleBlur() {
        setTimeout(() => {
            isOpen = false;
        }, 200);
    }

    // Tastatursteuerung für das Dropdown
    function handleKeydown(event, opt) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectOption(opt);
        }
    }
</script>

<div class="searchable-select">
    {#if multiple}
        {#each value as val}
            <input type="hidden" {name} value={val} />
        {/each}
    {:else}
        <input type="hidden" {name} bind:value />
    {/if}

    <input
        type="text"
        class="search-input"
        {placeholder}
        bind:value={searchTerm}
        on:focus={handleFocus}
        on:input={() => {
            isOpen = true;
            if (!multiple) value = "";
        }}
        on:blur={handleBlur}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="dropdown-list"
    />

    {#if isOpen}
        <ul
            id="dropdown-list"
            class="dropdown-list"
            role="listbox"
            aria-multiselectable={multiple}
        >
            {#each filteredOptions as opt}
                <li
                    role="option"
                    aria-selected={multiple
                        ? value.includes(opt.value)
                        : value === opt.value}
                    tabindex="0"
                    on:mousedown|preventDefault
                    on:click={() => selectOption(opt)}
                    on:keydown={(e) => handleKeydown(e, opt)}
                    class:selected={multiple && value.includes(opt.value)}
                >
                    {#if multiple}
                        <input
                            type="checkbox"
                            checked={value.includes(opt.value)}
                            tabindex="-1"
                            aria-hidden="true"
                            style="pointer-events: none; margin-right: 8px;"
                        />
                    {/if}
                    {opt.label}
                </li>
            {/each}

            {#if filteredOptions.length === 0}
                <li
                    class="no-results"
                    role="option"
                    aria-selected="false"
                    aria-disabled="true"
                >
                    Keine Treffer gefunden
                </li>
            {/if}
        </ul>
    {/if}
</div>

<style>
    .searchable-select {
        position: relative;
        width: 100%;
    }
    .search-input {
        width: 100%;
        padding: 0.6rem;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        font-size: 1rem;
        background-color: white;
        transition:
            border-color 0.2s,
            box-shadow 0.2s;
    }
    .search-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
    }
    .dropdown-list {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        max-height: 250px;
        overflow-y: auto;
        z-index: 50;
        list-style: none;
        margin: 0;
        padding: 0;
        box-shadow:
            0 10px 15px -3px rgba(0, 0, 0, 0.1),
            0 4px 6px -2px rgba(0, 0, 0, 0.05);
    }
    .dropdown-list li {
        padding: 10px 12px;
        cursor: pointer;
        border-bottom: 1px solid #f1f5f9;
        color: #334155;
        font-size: 0.95rem;
        display: flex;
        align-items: center;
    }
    .dropdown-list li:last-child {
        border-bottom: none;
    }
    .dropdown-list li:hover,
    .dropdown-list li:focus {
        background: #f1f5f9;
        color: #0f172a;
        outline: none;
    }
    .dropdown-list li.selected {
        background: #eff6ff;
        font-weight: 500;
    }
    .no-results {
        color: #94a3b8 !important;
        cursor: default !important;
        background: transparent !important;
        font-style: italic;
    }
</style>
