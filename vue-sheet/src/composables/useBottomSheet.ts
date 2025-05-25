import { type Ref, type WritableComputedRef, computed, ref } from "vue"

export type BottomSheetState = 'closed' | 'default' | 'full'

export interface UseBottomSheetStateOptions {
    initialState?: BottomSheetState
    onStateChange?: (state: BottomSheetState) => void
    transitionDuration?: number
}

export function useBottomSheet(openState: Ref<boolean> | WritableComputedRef<boolean>, options: UseBottomSheetStateOptions = {}) {
    const {
        initialState = 'closed',
        onStateChange,
        transitionDuration = 300
    } = options

    const state = ref<BottomSheetState>(initialState)
    const isTransitioning = ref(false)
    
    function setState(newState: BottomSheetState) {
        if (state.value === newState) return
        
        isTransitioning.value = true
        state.value = newState

        if (openState.value) {
            openState.value = newState !== 'closed'
        }
        
        onStateChange?.(newState)
        
        setTimeout(() => {
            isTransitioning.value = false
        }, transitionDuration)
    }

    const transitions = {
        closed: {
            open: () => setState('default')
        },
        default: {
            close: () => setState('closed'),
            expand: () => setState('full')
        },
        full: {
            collapse: () => setState('default'),
            close: () => setState('closed')
        }
    }

    function open() {
        if (state.value === 'closed') {
            transitions.closed.open()
            return
        }
        if (state.value === 'default') {
            transitions.default.expand()
            return
        }
    }

    function close() {
        if (state.value === 'default') transitions.default.close()
        if (state.value === 'full') transitions.full.close()
    }

    function expand() {
        if (state.value === 'default') transitions.default.expand()
    }

    function collapse() {
        if (state.value === 'full') transitions.full.collapse()
    }

    return {
        state: computed(() => state.value),
        isTransitioning,
        
        open,
        close,
        expand,
        collapse
    }
}