import type { BottomSheetState } from './useBottomSheet'
import { type Ref, ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'



export interface DynamicPositionConfig {
    fullStateTopMargin?: number;
    defaultStateMinPixels?: number;
    defaultStateMaxPixels?: number;
    minContentHeightForFullScreen?: number;
    autoHeight?: boolean;
    extraBottomPadding?: number;
    iosBottomPadding?: number;
    androidBottomPadding?: number;
    heightBuffer?: number;
}

export interface StatePositions {
  closed: number | '100vh';
  default: number;
  full: number;
}

export function useDynamicPositions(
    sheetRef: Ref<HTMLElement | null>,
    contentRef: Ref<HTMLElement | null>,
    currentState: Ref<BottomSheetState>,
    config: DynamicPositionConfig = {}
) {
    const isBrowser = typeof window !== 'undefined';

    const {
        fullStateTopMargin = 0,
        defaultStateMinPixels = 100,
        defaultStateMaxPixels = 600,
        minContentHeightForFullScreen = 300,
        autoHeight = true,
        iosBottomPadding = 40,
        androidBottomPadding = 20,
    } = config;

    const statePositions = ref<StatePositions>({
        closed: '100vh',
        default: 600,
        full: 0
    });

    const contentHeight = ref(0);
    const contentPadding = ref(0);
    const dragHandleHeight = ref(0);
    const headerHeight = ref(0);
    const viewportHeight = ref(isBrowser ? window.innerHeight : 1000);
    
    const isMobile = computed(() => {
        if (!isBrowser) return false;
        return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    });
    
    const isIOS = computed(() => {
        if (!isBrowser) return false;
        return /iPhone|iPad|iPod/i.test(navigator.userAgent);
    });
    
    // const devicePadding = computed(() => {
    //     if (isIOS.value) return iosBottomPadding;
    //     if (isMobile.value) return androidBottomPadding;
    //     return 0;
    // });
    
    const shouldEnableFullScreen = computed(() => 
        contentHeight.value >= minContentHeightForFullScreen
    );

    let contentResizeObserver: ResizeObserver | null = null;
    
    const handleWindowResize = () => {
        if (!isBrowser) return;
        viewportHeight.value = window.innerHeight;
        calculateStatePositions();
    };

    const calculateStatePositions = () => {
        if (!isBrowser) return;
        
        const closedPosition = viewportHeight.value;
        const fullPosition = Math.round(viewportHeight.value * fullStateTopMargin);
        
        statePositions.value.closed = closedPosition;
        statePositions.value.full = fullPosition;
        
        if (contentRef.value) {
            calculateContentBasedHeight();
        }
        else {
            statePositions.value.default = viewportHeight.value - defaultStateMinPixels;
        }
    };
    
    const calculateContentBasedHeight = () => {
        if (!contentRef.value || !sheetRef.value) return;
        
        const sheetElement = sheetRef.value;
        const contentElement = contentRef.value;
        
        const dragHandle = sheetElement.querySelector('.drag-handle');
        dragHandleHeight.value = dragHandle ? dragHandle.getBoundingClientRect().height : 0;
        
        const header = contentElement.querySelector('.bottom-sheet-header');
        headerHeight.value = header ? header.getBoundingClientRect().height : 0;
        
        const contentStyles = window.getComputedStyle(contentElement);
        contentPadding.value = parseFloat(contentStyles.paddingTop) + parseFloat(contentStyles.paddingBottom);
        
        const getRecursiveHeight = (element: Element): number => {
            let totalHeight = 0;
            
            if (element instanceof HTMLElement) {
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                const marginTop = parseFloat(style.marginTop);
                const marginBottom = parseFloat(style.marginBottom);
                
                totalHeight += rect.height + marginTop + marginBottom;
                
                if (style.overflow === 'auto' || style.overflow === 'scroll' || 
                    style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    totalHeight = Math.max(totalHeight, element.scrollHeight + marginTop + marginBottom);
                }
            }
            
            return totalHeight;
        };
        
        let childrenHeight = 0;
        Array.from(contentElement.children).forEach(child => {
            childrenHeight += getRecursiveHeight(child);
        });
        
        let spacersHeight = 0;
        const spacers = contentElement.querySelectorAll('.spacer');
        spacers.forEach(spacer => {
            spacersHeight += spacer.getBoundingClientRect().height;
        });
        
        const scrollContentHeight = contentElement.scrollHeight;
        const offsetHeight = contentElement.offsetHeight;
        const clientHeight = contentElement.clientHeight;
        
        contentHeight.value = Math.max(
            scrollContentHeight,
            offsetHeight,
            clientHeight,
            childrenHeight
        );
        
        const totalRequiredHeight = 
            dragHandleHeight.value + 
            contentHeight.value;

        let finalHeight = totalRequiredHeight;
        if (finalHeight < defaultStateMinPixels) {
            finalHeight = defaultStateMinPixels;
        }
        if (finalHeight > defaultStateMaxPixels) {
            finalHeight = defaultStateMaxPixels;
        }
        
        statePositions.value.default = viewportHeight.value - finalHeight;
    };

    const setupObservers = () => {
        if (!isBrowser) return;
        
        if (contentRef.value && 'ResizeObserver' in window) {
            contentResizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    calculateStatePositions();
                }
            });
            contentResizeObserver.observe(contentRef.value);
            
            if (contentRef.value.children.length > 0) {
                Array.from(contentRef.value.children).forEach(child => {
                    contentResizeObserver?.observe(child);
                });
            }
        }

        window.addEventListener('resize', handleWindowResize);
    };

    const cleanupObservers = () => {
        if (!isBrowser) return;
        
        if (contentResizeObserver) {
            contentResizeObserver.disconnect();
            contentResizeObserver = null;
        }
        window.removeEventListener('resize', handleWindowResize);
    };

    onMounted(() => {
        if (isBrowser) {
            setTimeout(() => {
                calculateStatePositions();
                setupObservers();
            }, 0);
        }
    });

    onBeforeUnmount(() => {
        cleanupObservers();
    });

    watch(contentRef, (newRef, oldRef) => {
        if (!isBrowser) return;
        
        if (oldRef && contentResizeObserver) {
            contentResizeObserver.unobserve(oldRef);
        }
        if (newRef) {
            cleanupObservers();
            setupObservers();
        }
    });

    watch(sheetRef, () => {
        if (isBrowser) {
            calculateStatePositions();
        }
    });
    
    const recalculate = () => {
        if (!isBrowser) return;
        
        // setTimeout(() => {
            calculateStatePositions();
        // }, 10);
    };

    return {
        statePositions,
        contentHeight,
        viewportHeight,
        shouldEnableFullScreen,
        recalculate,
        isMobile,
        isIOS
    };
}