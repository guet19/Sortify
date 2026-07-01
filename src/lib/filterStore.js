import { writable } from 'svelte/store';

export const assignFilterStore = writable({
    searchQuery: "",
    selectedMainCategoryId: "",
    selectedSubcategoryId: "",
    currentSort: "name_asc",
    barcodeFilter: "all",
    selectedAttributeFilters: {},
    activeRangeFilters: {}
});