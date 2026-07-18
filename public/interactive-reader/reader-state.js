export function createReaderState(sceneCount) {
  if (!Number.isInteger(sceneCount) || sceneCount < 1) {
    throw new TypeError("sceneCount must be a positive integer");
  }

  return {
    sceneCount,
    sceneIndex: 0,
    phase: "anticipation",
    textVisible: true,
  };
}

export function revealScene(state) {
  if (state.phase !== "anticipation") return state;
  return { ...state, phase: "revealed", textVisible: false };
}

export function goToNextScene(state) {
  if (state.phase !== "revealed") return state;
  if (state.sceneIndex >= state.sceneCount - 1) {
    return { ...state, phase: "complete", textVisible: true };
  }

  return {
    ...state,
    sceneIndex: state.sceneIndex + 1,
    phase: "anticipation",
    textVisible: true,
  };
}

export function goToPreviousScene(state) {
  if (state.sceneIndex === 0) return state;
  return {
    ...state,
    sceneIndex: state.sceneIndex - 1,
    phase: "revealed",
    textVisible: false,
  };
}

export function setTextVisibility(state, textVisible) {
  if (state.phase !== "revealed") return state;
  return { ...state, textVisible: Boolean(textVisible) };
}
