import type { Ref } from 'vue';

import type { BottomSheetState } from './useBottomSheet';
import type { StatePositions } from './useDynamicPositions';
import { ref, computed, reactive, onBeforeUnmount } from 'vue';

export type DragBehaviour = 'followCursor' | 'logarithmic' | 'rubberBand';

export interface StateDragConfig {
    state: BottomSheetState;
    behaviour: DragBehaviour;
    transitionThreshold?: number;
}

export interface DragBehaviourOptions {
    statePositions: StatePositions;
    currentState: Ref<BottomSheetState>;
    dragStartY: Ref<number>;
    maxDragDistance?: number;
    rubberBandFactor?: number;
    logarithmicBase?: number;
    stateBehaviours: StateDragConfig[];
}

/**
 * Handles drag behaviors with smooth state transitions
 */
export function useDragBehaviours(options: DragBehaviourOptions) {
    const stateBehaviours = options.stateBehaviours;
    
    const currentBehaviour = ref<DragBehaviour>(
        stateBehaviours.find(config => config.state === options.currentState.value)?.behaviour || 'followCursor'
    );

    const currentDragY = ref(0);
    let initialSheetPosition = 0;
    
    const isInTransitionZone = ref(false);
    const targetState = ref<BottomSheetState | null>(null);
    

    const transitionHistory = reactive({
        enteredZone: false,
        enterPosition: 0,
        direction: 0,
        lastDirection: 0,
        directionConsistencyCount: 0,

        stablePosition: 0,
        positionSamples: [] as number[],
        lastTransitionCheck: 0
    });
    
    let statePositions = options.statePositions;
    
    const updatePositionFromState = () => {
        const statePosition = statePositions[options.currentState.value];
        if (currentDragY.value !== statePosition) {
            //@ts-expect-error
            currentDragY.value = statePosition;
            //@ts-expect-error
            initialSheetPosition = statePosition;
            
            targetState.value = null;
            isInTransitionZone.value = false;
            
            transitionHistory.enteredZone = false;
            transitionHistory.enterPosition = 0;
            transitionHistory.direction = 0;
            transitionHistory.lastDirection = 0;
            transitionHistory.directionConsistencyCount = 0;
            transitionHistory.stablePosition = 0;
            transitionHistory.positionSamples = [];
            
            const stateBehavior = stateBehaviours.find(config => config.state === options.currentState.value);
            if (stateBehavior) {
                currentBehaviour.value = stateBehavior.behaviour;
            }
        }
    };

    const velocity = reactive({
        current: 0,
        lastY: 0,
        lastTime: 0,
        samples: [] as {y: number, time: number}[],
        
        update(currentY: number) {
            const now = performance.now();
            
            const newDirection = currentY < this.lastY ? -1 : (currentY > this.lastY ? 1 : 0);
            
            if (newDirection !== 0) {
                if (newDirection === transitionHistory.lastDirection) {
                    transitionHistory.directionConsistencyCount++;
                } else {
                    transitionHistory.directionConsistencyCount = 0;
                }
                
                if (transitionHistory.directionConsistencyCount >= 2 || transitionHistory.direction === 0) {
                    transitionHistory.direction = newDirection;
                }
                
                transitionHistory.lastDirection = newDirection;
            }
            
            transitionHistory.positionSamples.push(currentY);
            if (transitionHistory.positionSamples.length > 5) {
                transitionHistory.positionSamples.shift();
            }
            
            if (transitionHistory.positionSamples.length >= 3) {
                transitionHistory.stablePosition = transitionHistory.positionSamples.reduce((sum, pos) => sum + pos, 0) / 
                                                transitionHistory.positionSamples.length;
            } else {
                transitionHistory.stablePosition = currentY;
            }
            
            this.samples.push({ y: currentY, time: now });
            if (this.samples.length > 4) this.samples.shift();
            
            if (this.samples.length >= 2) {
                const oldestSample = this.samples[0];

                if (!oldestSample) return;
                
                const timeWindow = now - oldestSample.time;
                
                if (timeWindow > 0) {
                    this.current = (currentY - oldestSample.y) / timeWindow;

                    if (Math.abs(this.current) < 0.1) {
                        this.current *= 1.5;
                    }
                }
            }
            
            this.lastY = currentY;
            this.lastTime = now;
        },
        
        get isSignificant() {
            return Math.abs(this.current) > 0.6;
        }
    });

    
    const calculateDragFollowCursor = (currentY: number): number => {
        const deltaY = currentY - options.dragStartY.value;
        return initialSheetPosition + deltaY;
    };
    
    const calculateDragLogarithmic = (currentY: number): number => {
        const deltaY = currentY - options.dragStartY.value;
        const factor = options.logarithmicBase || 0.9;
        const maxDistance = options.maxDragDistance || 300;
        
        const dampenedDelta = deltaY * (1 - Math.min(Math.abs(deltaY) / maxDistance, 0.9) * factor);
        
        return initialSheetPosition + dampenedDelta;
    };
    
    const calculateDragRubberBand = (currentY: number): number => {
        const deltaY = currentY - options.dragStartY.value;
        const factor = options.rubberBandFactor || 0.5;
        const maxDistance = options.maxDragDistance || 300;
        
        if (Math.abs(deltaY) < 15) {
            return initialSheetPosition + deltaY * 0.85;
        }
        
        const dampenedDelta = deltaY * (1 - Math.min(Math.abs(deltaY) / maxDistance, 0.8) * factor);
        
        return initialSheetPosition + dampenedDelta;
    };

    const getPositionForBehaviour = (behavior: DragBehaviour, currentY: number): number => {
        switch (behavior) {
            case 'followCursor':
                return calculateDragFollowCursor(currentY);
            case 'logarithmic':
                return calculateDragLogarithmic(currentY);
            case 'rubberBand':
                return calculateDragRubberBand(currentY);
            default:
                return calculateDragFollowCursor(currentY);
        }
    };

    const checkTransitionZone = (currentCursorY: number): void => {
        const now = performance.now();
        const minCheckInterval = 50;
        
        if (now - transitionHistory.lastTransitionCheck < minCheckInterval && 
            !velocity.isSignificant && 
            isInTransitionZone.value === false) {
            return;
        }
        
        transitionHistory.lastTransitionCheck = now;
        
        const currentStateConfig = stateBehaviours.find(config => 
            config.state === options.currentState.value
        );
        
        if (!currentStateConfig) {
            isInTransitionZone.value = false;
            targetState.value = null;
            return;
        }
        
        const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1000;
        
        const stablePosition = transitionHistory.stablePosition;
        const stableDeltaY = stablePosition - options.dragStartY.value;
        
        const baseThreshold = viewportHeight * 0.15;
        
        const velocityFactor = Math.min(Math.abs(velocity.current) * 2, 0.5);
        
        const enterThreshold = baseThreshold * (1 - velocityFactor);
        const exitThreshold = baseThreshold * (1 - velocityFactor) * 0.6;
        
        const minDistanceToTransitionPx = 30;
        
        let transitionTarget: BottomSheetState | null = null;
        let inTransitionZone = false;
        
        if (isInTransitionZone.value && targetState.value) {
            let significantReversal = false;
            
            switch (targetState.value) {
                case 'full':
                    if (stableDeltaY > -exitThreshold * 0.8) {
                        significantReversal = true;
                    }
                    break;
                case 'default':
                    if (options.currentState.value === 'closed') {
                        if (stableDeltaY > -exitThreshold * 0.8) {
                            significantReversal = true;
                        }
                    } else if (options.currentState.value === 'full') {
                        if (stableDeltaY < exitThreshold * 0.8) {
                            significantReversal = true;
                        }
                    }
                    break;
                case 'closed':
                    if (stableDeltaY < exitThreshold * 0.8) {
                        significantReversal = true;
                    }
                    break;
            }
            
            if (!significantReversal) {
                return;
            }
        }
        
        const hasConsistentDirection = transitionHistory.directionConsistencyCount >= 3;
        
        switch (options.currentState.value) {
            case 'default':
                if (stableDeltaY < -enterThreshold && 
                    Math.abs(stableDeltaY) > minDistanceToTransitionPx && 
                    (hasConsistentDirection || velocity.isSignificant)) {
                    transitionTarget = 'full';
                    inTransitionZone = true;
                } else if (stableDeltaY > enterThreshold && 
                          Math.abs(stableDeltaY) > minDistanceToTransitionPx && 
                          (hasConsistentDirection || velocity.isSignificant)) {
                    transitionTarget = 'closed'; 
                    inTransitionZone = true;
                }
                break;
            case 'closed':
                if (stableDeltaY < -enterThreshold && 
                    Math.abs(stableDeltaY) > minDistanceToTransitionPx && 
                    (hasConsistentDirection || velocity.isSignificant)) {
                    transitionTarget = 'default';
                    inTransitionZone = true;
                }
                break;
            case 'full':
                if (stableDeltaY > enterThreshold && 
                    Math.abs(stableDeltaY) > minDistanceToTransitionPx && 
                    (hasConsistentDirection || velocity.isSignificant)) {
                    transitionTarget = 'default';
                    inTransitionZone = true;
                }
                break;
        }
        
        if (inTransitionZone && !isInTransitionZone.value) {
            transitionHistory.enteredZone = true;
            transitionHistory.enterPosition = currentCursorY;
        } 
        else if (!inTransitionZone) {
            transitionHistory.enteredZone = false;
        }
        
        isInTransitionZone.value = inTransitionZone;
        targetState.value = transitionTarget;
    };
    
    const calculateDragPosition = (currentY: number): number => {
        velocity.update(currentY);
        
        checkTransitionZone(currentY);
        
        return getPositionForBehaviour(currentBehaviour.value, currentY);
    };
    
    const setStateBehaviour = (stateConfig: StateDragConfig) => {
        const index = stateBehaviours.findIndex(config => config.state === stateConfig.state);
        
        if (index >= 0) {
            stateBehaviours[index] = stateConfig;
        } else {
            stateBehaviours.push(stateConfig);
        }
        
        if (stateConfig.state === options.currentState.value) {
            currentBehaviour.value = stateConfig.behaviour;
        }
    };

    return {
        currentDragY,
        currentBehaviour,
        isInTransitionZone,
        targetState,
        calculateDragPosition,
        setStateBehaviour,
        updatePositionFromState,
        
        velocity: computed(() => velocity.current),
        isSignificantVelocity: computed(() => velocity.isSignificant),
        
        get statePositions() {
            return statePositions;
        },
        set statePositions(newPositions: StatePositions) {
            statePositions = newPositions;
        },
        
        get initialSheetPosition() {
            return initialSheetPosition;
        },
        set initialSheetPosition(position: number) {
            initialSheetPosition = position;
            currentDragY.value = position;
        }
    };
}