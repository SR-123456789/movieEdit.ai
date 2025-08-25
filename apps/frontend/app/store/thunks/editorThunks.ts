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
    const mediaIdx = mediaFiles.findIndex(e => currentTime > e.positionStart && currentTime < e.positionEnd);
    if (mediaIdx >= 0) {
      dispatch(setActiveElement('media'));
      dispatch(setActiveElementIndex(mediaIdx));
      activeElement = 'media';
      activeElementIndex = mediaIdx;
    } else {
      const textIdx = textElements.findIndex(e => currentTime > e.positionStart && currentTime < e.positionEnd);
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
