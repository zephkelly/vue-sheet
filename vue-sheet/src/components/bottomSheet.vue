<template>
    <!-- <Teleport to="#teleports"> -->
        <div class="modal">
            <div
                ref="zephzephBottomSheetRef"
                class="zeph-bottom-sheet"
                :class="[
                    `state-${state}`,
                    { 'drag-disabled': !enableDrag },
                    { 'is-dragging': isDragging },
                    { 'is-transition-zone': isInTransitionZone },
                    { 'no-fullscreen-drag': !allowFullscreenDrag && state === 'full' },
                    isInTransitionZone && transitionTarget !== 'none' ? `transition-target-${transitionTarget}` : ''
                ]"
                :style="sheetStyle"
                @touchstart="handleInteraction"
                @mousedown="handleInteraction"
            >
                <div
                    v-if="closedTransitionFade"
                    class="close-transition-overlay"
                    :class="{ 'active': isInTransitionZone && transitionTarget === 'closed' }"
                ></div>

                <div 
                    v-if="fullscreenTransitionFade"
                    class="open-transition-overlay"
                    :class="{ 'active': isInTransitionZone && transitionTarget === 'full' }"
                ></div>

                <div 
                    v-if="enableDrag" 
                    class="drag-handle"
                    :class="{ 'disabled-in-fullscreen': !allowFullscreenDrag && state === 'full' }"
                    @touchstart="startDrag"
                    @mousedown="startDrag"
                >
                    <div class="drag-handle-inner">
                        <div
                            class="drag-handle-bar"
                            :class="{
                            'transition-zone': isInTransitionZone,
                            'disabled-in-fullscreen': !allowFullscreenDrag && state === 'full'
                            }"
                        ></div>
                    </div>
                </div>
                <div class="bottom-sheet-content" ref="contentRef">
                    <div class="bottom-sheet-header" v-if="$slots.header">
                        <slot name="header">
                        </slot>
                    </div>

                    <div class="spacer" v-if="$slots.header"></div>

                    <slot></slot>
                </div>
            </div>

            <div 
                class="modal-overlay" 
                @click="handleOutsideClickToClose"
                :class="{ 'active': modelValue && state !== 'closed' }"
            ></div>
            <div class="modal-underlay"></div>
        </div>
    <!-- </Teleport> -->
</template>
    
<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'

import { useBottomSheet, type BottomSheetState } from '../composables/useBottomSheet'
import { useDragBehaviours, type DragBehaviour, type StateDragConfig } from '../composables/useDragBehaviours'
import { useDynamicPositions, type DynamicPositionConfig } from '../composables/useDynamicPositions'
  
type BottomSheetProps = {
    modelValue: boolean;
    enableDrag?: boolean;
    allowFullscreenDrag?: boolean;
    initialState?: BottomSheetState;
    initialDragBehaviour?: DragBehaviour;
    dynamicPositionConfig?: DynamicPositionConfig;
    stateBehaviours?: StateDragConfig[];
    autoHeight?: boolean;
    fullscreenTransitionFade?: boolean;
    closedTransitionFade?: boolean;
}

const isServer = typeof window === 'undefined';

const props = withDefaults(defineProps<BottomSheetProps>(), {
    enableDrag: true,
    allowFullscreenDrag: true,
    initialState: 'default',
    initialDragBehavior: 'followCursor',
    autoHeight: true,
    dynamicPositionConfig: () => ({
        fullStateTopMargin: 0,
        autoHeight: true
    }),
    stateBehaviours: () => [
        { state: 'default', behaviour: 'rubberBand', transitionThreshold: 0.7 },
        { state: 'full', behaviour: 'rubberBand', transitionThreshold: 0.7 },
        { state: 'closed', behaviour: 'rubberBand', transitionThreshold: 0.7 }
    ]
})

const modelValue = computed({
    get: () => props.modelValue,
    set: (value) => {
        emit('update:modelValue', value)
    }
})
  
const emit = defineEmits(['update:modelValue', 'state-change', 'drag-behavior-change', 'transition-zone-change', 'transition-target-change', 'height-change'])
  
const zephBottomSheetRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const dragStartY = ref(0)
const dragStartTime = ref(0)
const hasMovedSignificantly = ref(false)
  
const { 
    state, 
    open,
    close,
    expand,
    collapse 
} = useBottomSheet(modelValue, {
    initialState: props.initialState,
    onStateChange: (newState: BottomSheetState) => {
        emit('state-change', newState)
        dragBehaviors.updatePositionFromState()
    }
})

function handleOutsideClickToClose() {
    if (props.enableDrag) {
        close()
    }
}

const dynamicPositionConfig = computed(() => ({
    ...props.dynamicPositionConfig,
    autoHeight: props.autoHeight
}));

  
const positionConfig = useDynamicPositions(
    zephBottomSheetRef, 
    contentRef, 
    state, 
    dynamicPositionConfig.value,
)
  
watch(() => positionConfig.contentHeight.value, (newHeight) => {
    emit('height-change', newHeight)
})
  
const dragBehaviors = useDragBehaviours({
    statePositions: positionConfig.statePositions.value,
    currentState: state,
    dragStartY,
    maxDragDistance: 300,
    rubberBandFactor: 0.65,
    logarithmicBase: 0.9,
    stateBehaviours: props.stateBehaviours
})
  
const currentDragBehavior = computed(() => dragBehaviors.currentBehaviour.value)
const isInTransitionZone = computed(() => dragBehaviors.isInTransitionZone.value)
const transitionTarget = computed(() => dragBehaviors.targetState?.value || 'none')
  
const isDragAllowed = computed(() => {
    if (!props.enableDrag) return false;
    if (state.value === 'full' && !props.allowFullscreenDrag) return false;
    return true;
})
  
watch(() => dragBehaviors.isInTransitionZone.value, (isInZone) => {
    emit('transition-zone-change', isInZone)
})

watch(() => dragBehaviors.targetState?.value, (newTarget) => {
    if (newTarget) {
        emit('transition-target-change', newTarget)
    }
})
  
watch(() => props.modelValue, (isOpen) => {
    if (isOpen) {
        nextTick(() => {
            positionConfig.recalculate();
        });
    }
}, { immediate: true })
  
  
const sheetStyle = computed(() => {
    const yPosition = isDragging.value 
        ? dragBehaviors.currentDragY.value 
        : positionConfig.statePositions.value[state.value];

    if (yPosition === '100vh') {
        return {
            transform: `translate3d(0, ${yPosition}, 0)`,
            WebkitTransform: `translate3d(0, ${yPosition}, 0)`,
        };
    }
    else {
        return {
            transform: `translate3d(0, ${yPosition}px, 0)`,
            WebkitTransform: `translate3d(0, ${yPosition}px, 0)`,
        };
    }
});
  
const intentTimers = ref<Record<string, number>>({});
const dragIntentTimeout = 200;
let currentPointerIdDragging: number | null = null;

function handleInteraction(event: MouseEvent | TouchEvent) {
    if (!isDragAllowed.value) return;
    
    if (isDragging.value && currentPointerIdDragging !== null) {
        if (event instanceof TouchEvent && event.touches.length > 0) {
            if (!event.touches[0]) return;
            const pointerId = event.touches[0].identifier;
            if (pointerId !== currentPointerIdDragging) return;
        }
        return;
    }
    
    const target = event.target as HTMLElement;
    
    const isDragHandle = !!target.closest('.drag-handle');
    
    if (isDragHandle) {
        if (event.cancelable) {
            event.preventDefault();
        }
        startDrag(event);
    }
    else {
        setupDragIntent(event);
    }
}

function isTouchEventSafe(event: MouseEvent | TouchEvent): boolean {
    return typeof TouchEvent !== 'undefined' && event instanceof TouchEvent;
}

function setupDragIntent(event: MouseEvent | TouchEvent) {
    if (isServer) return;
    
    let pointerId: string | number = 'mouse';
    let startY: number | undefined;
    
    // Handle touch events
    if (isTouchEventSafe(event)) {
        const touchEvent = event as TouchEvent;
        
        if (touchEvent.touches.length > 0) {
            const touch = touchEvent.touches[0];
            if (!touch) return;
            pointerId = touch.identifier;
            startY = touch.clientY;
        } else {
            return;
        }
        
        document.addEventListener('touchmove', detectDragIntent, { passive: false });
        document.addEventListener('touchend', cancelDragIntent);
        document.addEventListener('touchcancel', cancelDragIntent);
    } 
    // Handle mouse events
    else {
        const mouseEvent = event as MouseEvent;
        startY = mouseEvent.clientY;
        
        document.addEventListener('mousemove', detectDragIntent);
        document.addEventListener('mouseup', cancelDragIntent);
    }
    
    if (startY === undefined) return;
    
    dragStartY.value = startY;
    dragStartTime.value = Date.now();
    
    intentTimers.value[pointerId] = window.setTimeout(() => {
        cancelDragIntent();
    }, dragIntentTimeout);
}


function detectDragIntent(event: MouseEvent | TouchEvent) {
    if (isServer) return;
    
    let currentY: number | undefined;
    
    if (isTouchEventSafe(event)) {
        const touchEvent = event as TouchEvent;
        
        if (touchEvent.touches.length > 0) {
            if (!touchEvent.touches[0]) return;
            currentY = touchEvent.touches[0].clientY;
        } else {
            return;
        }
    } 
    else {
        const mouseEvent = event as MouseEvent;
        currentY = mouseEvent.clientY;
    }
    
    if (currentY === undefined) return;
    
    const yDelta = Math.abs(currentY - dragStartY.value);
    
    if (yDelta > 5) {
        Object.keys(intentTimers.value).forEach(key => {
            clearTimeout(intentTimers.value[key]);
            delete intentTimers.value[key];
        });
        
        removeIntentListeners();
        
        if (isTouchEventSafe(event)) {
            const touchEvent = event as TouchEvent;
            if (touchEvent.touches.length > 0) {
                if (!touchEvent.touches[0]) return;
                currentPointerIdDragging = touchEvent.touches[0].identifier;
            } else {
                currentPointerIdDragging = null;
            }
        } else {
            currentPointerIdDragging = null;
        }
        
        startDrag(event);
    }
}

function cancelDragIntent() {
    if (isServer) return;
    
    Object.keys(intentTimers.value).forEach(key => {
        clearTimeout(intentTimers.value[key]);
        delete intentTimers.value[key];
    });
    
    removeIntentListeners();
}


function removeIntentListeners() {
    document.removeEventListener('touchmove', detectDragIntent);
    document.removeEventListener('touchend', cancelDragIntent);
    document.removeEventListener('touchcancel', cancelDragIntent);
    document.removeEventListener('mousemove', detectDragIntent);
    document.removeEventListener('mouseup', cancelDragIntent);
}



function startDrag(event: MouseEvent | TouchEvent) {
    if (isServer || !isDragAllowed.value) return;
    
    const currentPosition = positionConfig.statePositions.value[state.value];

    dragBehaviors.statePositions = positionConfig.statePositions.value;
    dragBehaviors.updatePositionFromState();

    let startY: number | undefined;
    
    if (isTouchEventSafe(event)) {
        const touchEvent = event as TouchEvent;
        if (touchEvent.touches.length > 0) {
            if (!touchEvent.touches[0]) return;
            startY = touchEvent.touches[0].clientY;
        }
    } else {
        startY = (event as MouseEvent).clientY;
    }

    if (startY === undefined) return;
        
    dragStartY.value = startY;
    dragStartTime.value = Date.now();
    hasMovedSignificantly.value = false;
    isDragging.value = true;

    if (currentPosition === '100vh') {
        return;
    }
    
    if (Math.abs(dragBehaviors.currentDragY.value - currentPosition) < 0.5) {
        dragBehaviors.initialSheetPosition = currentPosition + 0.1;
    }
    else {
        dragBehaviors.initialSheetPosition = currentPosition;
    }

    if (isTouchEventSafe(event)) {
        document.addEventListener('touchmove', handleDragMove, { passive: false });
        document.addEventListener('touchend', endDrag);
        document.addEventListener('touchcancel', endDrag);
    }
    else {
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', endDrag);
    }
}

function handleDragMove(event: MouseEvent | TouchEvent) {
    if (isServer || !isDragging.value) return;

    if (isTouchEventSafe(event) && currentPointerIdDragging !== null) {
        const touchEvent = event as TouchEvent;
        let found = false;
        
        for (let i = 0; i < touchEvent.touches.length; i++) {
            if (touchEvent.touches[i]?.identifier === currentPointerIdDragging) {
                found = true;
                break;
            }
        }
        
        if (!found) return;
    }

    let currentY: number | undefined;
    
    if (isTouchEventSafe(event)) {
        const touchEvent = event as TouchEvent;
        if (touchEvent.touches.length > 0) {
            if (!touchEvent.touches[0]) return;
            currentY = touchEvent.touches[0].clientY;
        }
    } else {
        currentY = (event as MouseEvent).clientY;
    }

    if (currentY === undefined) return;

    const yDelta = Math.abs(currentY - dragStartY.value);
    
    if (yDelta > 0) {
        hasMovedSignificantly.value = true;
        
        if (event.cancelable) {
            event.preventDefault();
        }
        
        dragBehaviors.currentDragY.value = dragBehaviors.calculateDragPosition(currentY);
        event.stopPropagation();
    }
}
  
function endDrag(event: MouseEvent | TouchEvent | null = null) {
    if (isServer || !isDragging.value) return;
    
    if (hasMovedSignificantly.value) {
        let targetState: BottomSheetState;
        
        if (dragBehaviors.isInTransitionZone.value && dragBehaviors.targetState?.value) {
            targetState = dragBehaviors.targetState.value;
        }
        else if (dragBehaviors.isSignificantVelocity.value) {
            const velocity = dragBehaviors.velocity.value;
            const direction = Math.sign(velocity);
          
            switch (state.value) {
                case 'default':
                    targetState = direction < 0 ? 'full' : 'closed';
                    break;
                case 'full':
                    targetState = direction > 0 ? 'default' : 'full';
                    break;
                case 'closed':
                    targetState = direction < 0 ? 'default' : 'closed';
                    break;
                default:
                    targetState = state.value;
            }
        }
        else {
            targetState = state.value;
        }
        
        if (targetState === 'default') {
            collapse();
        }
        else if (targetState === 'full') {
            expand();
        }
        else if (targetState === 'closed') {
            close();
            emit('update:modelValue', false);
        }
    }
    
    isDragging.value = false;
    hasMovedSignificantly.value = false;
    currentPointerIdDragging = null;
    
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchmove', handleDragMove);
    document.removeEventListener('touchend', endDrag);
    document.removeEventListener('touchcancel', endDrag);
    
    removeIntentListeners();
    
    Object.keys(intentTimers.value).forEach(key => {
        clearTimeout(intentTimers.value[key]);
        delete intentTimers.value[key];
    });
}
  
function setStateBehavior(stateConfig: StateDragConfig) {
    dragBehaviors.setStateBehaviour(stateConfig);
    emit('drag-behavior-change', currentDragBehavior.value);
}
  
watch(() => positionConfig.statePositions.value, (newPositions) => {
    dragBehaviors.statePositions = newPositions;
}, { deep: true });
  
watch(() => props.modelValue, (value) => {
    if (value && state.value === 'closed') {
        open();
    } else if (!value && state.value !== 'closed') {
        close();
    }
}, { immediate: true });
  
onBeforeUnmount(() => {
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchmove', handleDragMove);
    document.removeEventListener('touchend', endDrag);
    document.removeEventListener('touchcancel', endDrag);
    
    removeIntentListeners();
    
    Object.keys(intentTimers.value).forEach(key => {
        clearTimeout(intentTimers.value[key]);
    });
});
  
defineExpose({
    open,
    close,
    expand,
    collapse,
    state,
    currentDragBehavior,
    isInTransitionZone,
    transitionTarget,
    setStateBehavior,
    recalculatePositions: positionConfig.recalculate,
    contentHeight: positionConfig.contentHeight
});
</script>
  
<style scoped>
.modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
    will-change: opacity;
}
  
.modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    opacity: 0;
    transition: opacity 0.3s ease;
    -webkit-transition: opacity 0.3s ease;
    -moz-transition: opacity 0.3s ease;
    -o-transition: opacity 0.3s ease;
    -ms-transition: opacity 0.3s ease;
    pointer-events: none;
    will-change: opacity;

    &.active {
        opacity: 1;
        pointer-events: auto;
    }
}

.modal-underlay {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

.close-transition-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease;
    background: linear-gradient(
        to bottom,
        rgba(0, 0, 0, 0) 0%,
        rgba(0, 0, 0, 0.05) 15%,
        rgba(0, 0, 0, 0.11) 30%,
        rgba(0, 0, 0, 0.2) 60%,
        rgba(0, 0, 0, 0.41) 100%
    );
    border-radius: 1rem 1rem 0 0;
}

.open-transition-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease;
    background: linear-gradient(
        to bottom,
        rgba(65, 65, 65, 0.2) 0%,
        rgba(63, 63, 63, 0.05) 20%,
        rgba(65, 65, 65, 0) 100%
    );
    border-radius: 1rem 1rem 0 0;
}
    
.zeph-bottom-sheet {
    position: relative;
    bottom: 0;
    left: 0;
    width: 100%;
    max-width: 600px;
    background-color: white;
    border-radius: 1rem 1rem 0 0;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    z-index: 101;
    pointer-events: auto;
    will-change: transform, max-width;
    opacity: 1;

    transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
            border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
            width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
            opacity 0.3s ease,
              max-width 0.35s cubic-bezier(0.2, 0.0, 0.2, 1);
    -webkit-transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
            border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
            width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
            opacity 0.3s ease,
              max-width 0.35s cubic-bezier(0.2, 0.0, 0.2, 1);
    -moz-transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
            border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
            width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
            opacity 0.3s ease,
              max-width 0.35s cubic-bezier(0.2, 0.0, 0.2, 1);
    -o-transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
                border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
                width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
                opacity 0.3s ease,
              max-width 0.35s cubic-bezier(0.2, 0.0, 0.2, 1);
    -ms-transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
                border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
                opacity 0.3s ease,
                width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
              max-width 0.35s cubic-bezier(0.2, 0.0, 0.2, 1);

    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  
    overscroll-behavior: contain;
    -webkit-transform: translateZ(0);
    -webkit-touch-callout: none;

    .bottom-sheet-content {
        position: relative;
        flex: 1;
        -webkit-overflow-scrolling: touch;
        padding: 1rem;
        padding-top: 0rem;
        padding-bottom: 2.5rem;
        transform: translateZ(0);
        -webkit-transform: translateZ(0);
        touch-action: auto; /* Allow scrolling and interaction with content */
        pointer-events: auto; /* Ensure content receives events */
    }
  
    .bottom-sheet-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
    }
    
    .spacer {
        height: 16px;
    }
  
    &::before {
        content: '';
        position: absolute;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -1;
        top: 0;
        border: none;
        border-top-left-radius: 12px;
        border-top-right-radius: 12px;
    }
    
    &::after {
        content: '';
        position: absolute;
        left: 0px;
        width: 100%;
        height: 300vh;
        background-color: white;
        z-index: -1;
        top: 100%;
        border-top: none;
    }

    &.is-dragging {
        transition: none !important;
        -webkit-transition: none !important;
        -moz-transition: none !important;
        -o-transition: none !important;
        -ms-transition: none !important;
    }

    &.drag-disabled {
        .bottom-sheet-content {
            padding-top: 1.5rem;
        }
    }

    &.state-full {
        max-width: 100%;
        height: 100%;
        border-radius: 0rem 0rem 0rem 0rem;
        transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
            border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
            width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
              max-width 0.22s cubic-bezier(0.2, 0.0, 0.2, 1);
        -webkit-transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
                border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
                width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
                max-width 0.22s cubic-bezier(0.2, 0.0, 0.2, 1);
        -moz-transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
                border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
                width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
                max-width 0.22s cubic-bezier(0.2, 0.0, 0.2, 1);
        -o-transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
                    border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
                    width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
                max-width 0.22s cubic-bezier(0.2, 0.0, 0.2, 1);
        -ms-transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
                    border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
                    width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
                max-width 0.22s cubic-bezier(0.2, 0.0, 0.2, 1);

        .drag-handle {
            .drag-handle-bar {
                opacity: 0.3;
                transform: translate3d(0, -6px, 0);
                transition:
                    opacity 0.35s cubic-bezier(0.075, 0.82, 0.165, 1),
                    background-color 0.3s ease,
                    width 0.4s ease,
                    transform 0.35s cubic-bezier(0.075, 0.82, 0.165, 1),
            }

            &:hover {
                .drag-handle-bar {
                    opacity: 0.5;
                    transform: translate3d(0, -2px, 0);
                }
            }
        }


        &.is-dragging {
            border-radius: 1rem 1rem 0 0;

            .drag-handle {
                .drag-handle-bar {
                    opacity: 1;
                    
                }
            }
        }
    }

    &.state-default {
        transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
            border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
            width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
              max-width 0.45s cubic-bezier(0.2, 0.0, 0.2, 1);
    -webkit-transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
            border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
            width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
              max-width 0.45s cubic-bezier(0.2, 0.0, 0.2, 1);
    -moz-transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
            border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
            width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
              max-width 0.45s cubic-bezier(0.2, 0.0, 0.2, 1);
    -o-transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
                border-radius 0.35 cubic-bezier(0.75, 0.82, 0.165, 1),
                width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
              max-width 0.45s cubic-bezier(0.2, 0.0, 0.2, 1);
    -ms-transition: transform 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
                border-radius 0.35s cubic-bezier(0.75, 0.82, 0.165, 1),
                width 0.5s cubic-bezier(0.75, 0.82, 0.165, 1),
              max-width 0.45s cubic-bezier(0.2, 0.0, 0.2, 1);
    }

    &.state-closed {
        opacity: 0;
    }

    &.no-fullscreen-drag {
        border-radius: 0;
        
        .drag-handle {
            max-height: 0;
            padding: 0;
            opacity: 0;
        }
    }

    &.is-transition-zone {
        &.transition-target-full {
            .drag-handle-bar {
                transform: translate3d(0, -8px, 0);
            }
            .open-transition-overlay {
                opacity: 1;  
            }
        }
        &.transition-target-closed {
            .close-transition-overlay {
                opacity: 1;
            }

            .drag-handle-bar {
                transform: translate3d(0, 2px, 0);
            }
        }
    }
}
  
.drag-handle {
    width: 100%;
    height: 44px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    max-height: 44px;
    padding: 0.6rem;
    box-sizing: border-box;
    opacity: 1;
    border-radius: 1rem 1rem 0 0;
    transition: max-height 0.3s cubic-bezier(0.2, 0.0, 0.2, 1),
                opacity 0.22s cubic-bezier(0.2, 0.0, 0.2, 1);
    z-index: 10; /* Ensure handle is above content */

    .drag-handle-inner {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        border-radius: 0.5rem;
    }

    .drag-handle-bar {
        width: 36px;
        height: 4px;
        background-color: var(--text-5-color);
        border-radius: 4px;
        transition:
            opacity 0.35s cubic-bezier(0.075, 0.82, 0.165, 1),
            background-color 0.3s ease,
            width 0.4s ease,
            transform 0.35s ease;

        &.transition-zone {
            background-color: var(--text-color);
            width: 48px;
        }

        &.disabled-in-fullscreen {
            opacity: 0.5;
            background-color: #bbb;
        }
    }

    &.disabled-in-fullscreen {
        cursor: default;
        touch-action: auto;
    }
}


@media (max-width: 800px) {
    .bottom-sheet { 
        .bottom-sheet-content {
            padding-bottom: 4.5rem;
        }
    }
}
</style>