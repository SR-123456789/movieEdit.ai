import { AppDispatch, RootState } from "../index";
import { setActiveElement, setActiveElementIndex, setMediaFiles, setTextElements } from "../slices/projectSlice";
import toast from "react-hot-toast";
import type { MediaFile, TextElement } from "../../types";

// Split currently active element at currentTime
export const splitAtCurrentTime = () => (dispatch: AppDispatch, getState: () => RootState) => {
  const state = getState().projectState;
  let { activeElement, activeElementIndex, mediaFiles, textElements, currentTime } = state;

  // 自動対象選択（未選択の場合、currentTimeに重なる要素を優先順で選択）
  if (!activeElement) {
    const mediaIdx = mediaFiles.findIndex(e => currentTime >= e.positionStart && currentTime <= e.positionEnd);
    if (mediaIdx >= 0) {
      dispatch(setActiveElement('media'));
      dispatch(setActiveElementIndex(mediaIdx));
      activeElement = 'media';
      activeElementIndex = mediaIdx;
    } else {
      const textIdx = textElements.findIndex(e => currentTime >= e.positionStart && currentTime <= e.positionEnd);
      if (textIdx >= 0) {
        dispatch(setActiveElement('text'));
        dispatch(setActiveElementIndex(textIdx));
        activeElement = 'text';
        activeElementIndex = textIdx;
      }
    }
  }

  if (!activeElement) {
    toast.error('No element selected.');
    return;
  }

  if (activeElement === 'media') {
    const elements = [...mediaFiles];
    const element = elements[activeElementIndex] as MediaFile | undefined;
    if (!element) {
      toast.error('No element selected.');
      return;
    }
    let { positionStart, positionEnd } = element;
    // 境界にいる場合、わずかに内側に寄せる
    const eps = 0.001;
    if (currentTime <= positionStart) currentTime = Math.min(positionEnd - eps, positionStart + eps);
    if (currentTime >= positionEnd) currentTime = Math.max(positionStart + eps, positionEnd - eps);
    if (!(currentTime > positionStart && currentTime < positionEnd)) {
      toast.error('Marker is outside the selected element bounds.');
      return;
    }
    const positionDuration = positionEnd - positionStart;
    const { startTime, endTime } = element;
    const sourceDuration = endTime - startTime;
    const ratio = (currentTime - positionStart) / positionDuration;
    const splitSourceOffset = startTime + ratio * sourceDuration;

    const firstPart: MediaFile = {
      ...element,
      id: crypto.randomUUID(),
      positionStart,
      positionEnd: currentTime,
      startTime,
      endTime: splitSourceOffset,
    };
    const secondPart: MediaFile = {
      ...element,
      id: crypto.randomUUID(),
      positionStart: currentTime,
      positionEnd,
      startTime: splitSourceOffset,
      endTime,
    };
    elements.splice(activeElementIndex, 1, firstPart, secondPart);
    dispatch(setMediaFiles(elements));
    dispatch(setActiveElement(null));
    toast.success('Element split successfully.');
    return;
  }

  if (activeElement === 'text') {
    const elements = [...textElements];
    const element = elements[activeElementIndex] as TextElement | undefined;
    if (!element) {
      toast.error('No element selected.');
      return;
    }
    let { positionStart, positionEnd } = element;
    const eps = 0.001;
    if (currentTime <= positionStart) currentTime = Math.min(positionEnd - eps, positionStart + eps);
    if (currentTime >= positionEnd) currentTime = Math.max(positionStart + eps, positionEnd - eps);
    if (!(currentTime > positionStart && currentTime < positionEnd)) {
      toast.error('Marker is outside the selected element.');
      return;
    }

    const firstPart: TextElement = {
      ...element,
      id: crypto.randomUUID(),
      positionStart,
      positionEnd: currentTime,
    };
    const secondPart: TextElement = {
      ...element,
      id: crypto.randomUUID(),
      positionStart: currentTime,
      positionEnd,
    };
    elements.splice(activeElementIndex, 1, firstPart, secondPart);
    dispatch(setTextElements(elements));
    dispatch(setActiveElement(null));
    toast.success('Element split successfully.');
    return;
  }
};

// Duplicate currently active element
export const duplicateActiveElement = () => (dispatch: AppDispatch, getState: () => RootState) => {
  const state = getState().projectState;
  const { activeElement, activeElementIndex, mediaFiles, textElements } = state;

  if (activeElement === 'media') {
    const elements = [...mediaFiles];
    const element = elements[activeElementIndex] as MediaFile | undefined;
    if (!element) return toast.error('No element selected.');
    const duplicated: MediaFile = { ...element, id: crypto.randomUUID() };
    elements.splice(activeElementIndex + 1, 0, duplicated);
    dispatch(setMediaFiles(elements));
    dispatch(setActiveElement(null));
    toast.success('Element duplicated successfully.');
    return;
  }
  if (activeElement === 'text') {
    const elements = [...textElements];
    const element = elements[activeElementIndex] as TextElement | undefined;
    if (!element) return toast.error('No element selected.');
    const duplicated: TextElement = { ...element, id: crypto.randomUUID() };
    elements.splice(activeElementIndex + 1, 0, duplicated);
    dispatch(setTextElements(elements));
    dispatch(setActiveElement(null));
    toast.success('Element duplicated successfully.');
    return;
  }
  toast.error('No element selected.');
};

// Delete currently active element
export const deleteActiveElement = () => (dispatch: AppDispatch, getState: () => RootState) => {
  const state = getState().projectState;
  const { activeElement, activeElementIndex, mediaFiles, textElements } = state;

  if (activeElement === 'media') {
    const elements = [...mediaFiles];
    const element = elements[activeElementIndex] as MediaFile | undefined;
    if (!element) return toast.error('No element selected.');
    const filtered = elements.filter(e => e.id !== element.id);
    dispatch(setMediaFiles(filtered));
    dispatch(setActiveElement(null));
    toast.success('Element deleted successfully.');
    return;
  }
  if (activeElement === 'text') {
    const elements = [...textElements];
    const element = elements[activeElementIndex] as TextElement | undefined;
    if (!element) return toast.error('No element selected.');
    const filtered = elements.filter(e => e.id !== element.id);
    dispatch(setTextElements(filtered));
    dispatch(setActiveElement(null));
    toast.success('Element deleted successfully.');
    return;
  }
  toast.error('No element selected.');
};

// Split specific media clip by source time (params.targetTime)
// Requires: sourceSec strictly between element.startTime and element.endTime
export const splitClipByIdAtSourceTime = (id: string, sourceSec: number) => (dispatch: AppDispatch, getState: () => RootState) => {
  const { mediaFiles } = getState().projectState;
  const idx = mediaFiles.findIndex(m => m.id === id);
  if (idx < 0) {
    toast.error('Clip not found.');
    return;
  }
  const element = mediaFiles[idx];
  const { startTime, endTime, positionStart, positionEnd } = element;

  if (!(Number.isFinite(sourceSec))) {
    toast.error('Invalid cut time.');
    return;
  }
  // Enforce: cut only within source start/end
  if (!(sourceSec > startTime && sourceSec < endTime)) {
    toast.error('Cut time must be between startTime and endTime.');
    return;
  }
  const sourceDuration = endTime - startTime;
  if (!(sourceDuration > 0)) {
    toast.error('Invalid clip duration.');
    return;
  }
  const positionDuration = positionEnd - positionStart;
  const ratio = (sourceSec - startTime) / sourceDuration; // 0..1
  const timelineSplit = positionStart + ratio * positionDuration;

  // Build two parts
  const firstPart: MediaFile = {
    ...element,
    id: crypto.randomUUID(),
    positionStart,
    positionEnd: timelineSplit,
    startTime,
    endTime: sourceSec,
  };
  const secondPart: MediaFile = {
    ...element,
    id: crypto.randomUUID(),
    positionStart: timelineSplit,
    positionEnd,
    startTime: sourceSec,
    endTime,
  };

  const next = [...mediaFiles];
  next.splice(idx, 1, firstPart, secondPart);
  dispatch(setMediaFiles(next));
  dispatch(setActiveElement(null));
  toast.success('Element split successfully.');
};

// Delete element by id (media or text). If not found, no-op with toast.
export const deleteElementById = (id: string) => (dispatch: AppDispatch, getState: () => RootState) => {
  const { mediaFiles, textElements } = getState().projectState;
  const mediaIdx = mediaFiles.findIndex(m => m.id === id);
  if (mediaIdx >= 0) {
    const next = mediaFiles.filter(m => m.id !== id);
    dispatch(setMediaFiles(next));
    dispatch(setActiveElement(null));
    toast.success('Element deleted successfully.');
    return;
  }
  const textIdx = textElements.findIndex(t => t.id === id);
  if (textIdx >= 0) {
    const next = textElements.filter(t => t.id !== id);
    dispatch(setTextElements(next));
    dispatch(setActiveElement(null));
    toast.success('Element deleted successfully.');
    return;
  }
  toast.error('Element not found.');
};
