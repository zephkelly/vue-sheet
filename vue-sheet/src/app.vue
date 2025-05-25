
<template>
    <div class="app">
        <div class="app-header">
            <h1>Vue Sheet Example</h1>
            <button @click="isOpen = !isOpen">
                Toggle Bottom Sheet
            </button>
        </div>
        <div class="app-content">
            <BottomSheet
                ref="bottomSheetRef"
                :model-value="isOpen"
            >
                <p>Additional content can go here.</p>
                <div class="actions">
                    <button @click="isOpen = false" style="margin-right: 2rem;">Close</button>
                    <button @click="bottomSheetRef?.expand()">Expand</button>
                    <button @click="bottomSheetRef?.collapse()">Collapse</button>
                </div>
            </BottomSheet>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from 'vue';
import BottomSheet from './components/bottomSheet.vue';

const isOpen = ref(false);
const bottomSheetRef = useTemplateRef('bottomSheetRef');

</script>

<style scoped>

</style>
