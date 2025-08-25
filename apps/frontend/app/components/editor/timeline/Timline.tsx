/* eslint-disable react/forbid-dom-props */
import { useAppSelector, useAppDispatch } from "@/app/store";
import { setMarkerTrack, setTimelineZoom, setCurrentTime, setIsPlaying } from "@/app/store/slices/projectSlice";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import Header from "./Header";
import VideoTimeline from "./elements-timeline/VideoTimeline";
import ImageTimeline from "./elements-timeline/ImageTimeline";
import AudioTimeline from "./elements-timeline/AudioTimline";
import TextTimeline from "./elements-timeline/TextTimeline";
import { throttle } from 'lodash';
import GlobalKeyHandlerProps from "../../../components/editor/keys/GlobalKeyHandlerProps";
import toast from "react-hot-toast";
import { deleteActiveElement, duplicateActiveElement, splitAtCurrentTime } from "@/app/store/thunks/editorThunks";
export const Timeline = () => {
    const { currentTime, timelineZoom, enableMarkerTracking, activeElement, activeElementIndex, mediaFiles, textElements, duration, isPlaying } = useAppSelector((state) => state.projectState);
    const dispatch = useAppDispatch();
    const timelineRef = useRef<HTMLDivElement>(null)

    const throttledZoom = useMemo(() =>
        throttle((value: number) => {
            dispatch(setTimelineZoom(value));
        }, 100),
        [dispatch]
    );

    const handleSplit = () => {
        dispatch(splitAtCurrentTime());
    };

    const handleDuplicate = () => {
        dispatch(duplicateActiveElement());
    };

    const handleDelete = () => {
        dispatch(deleteActiveElement());
    };


    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineRef.current) return;

        dispatch(setIsPlaying(false));
        const rect = timelineRef.current.getBoundingClientRect();

        const scrollOffset = timelineRef.current.scrollLeft;
        const offsetX = e.clientX - rect.left + scrollOffset;

        const seconds = offsetX / timelineZoom;
        const clampedTime = Math.max(0, Math.min(duration, seconds));

        dispatch(setCurrentTime(clampedTime));
    };

    return (
        <div className="flex w-full flex-col gap-2">
            <div className="flex flex-row items-center justify-between gap-12 w-full">
                <div className="flex flex-row items-center gap-2">
                    {/* Track Marker */}
                    <button
                        onClick={() => dispatch(setMarkerTrack(!enableMarkerTracking))}
                        className="bg-white border rounded-md border-transparent transition-colors flex flex-row items-center justify-center text-gray-800 hover:bg-[#ccc] dark:hover:bg-[#ccc] mt-2 font-medium text-sm sm:text-base h-auto px-2 py-1 sm:w-auto"
                    >
                        {enableMarkerTracking ? <Image
                            alt="cut"
                            className="h-auto w-auto max-w-[20px] max-h-[20px]"
                            height={30}
                            width={30}
                            src="https://www.svgrepo.com/show/447546/yes-alt.svg"
                        /> : <Image
                            alt="cut"
                            className="h-auto w-auto max-w-[20px] max-h-[20px]"
                            height={30}
                            width={30}
                            src="https://www.svgrepo.com/show/447315/dismiss.svg"
                        />}
                        <span className="ml-2">Track Marker <span className="text-xs">(T)</span></span>
                    </button>
                    {/* Split */}
                    <button
                        onClick={handleSplit}
                        className="bg-white border rounded-md border-transparent transition-colors flex flex-row items-center justify-center text-gray-800 hover:bg-[#ccc] dark:hover:bg-[#ccc] mt-2 font-medium text-sm sm:text-base h-auto px-2 py-1 sm:w-auto"
                    >
                        <Image
                            alt="cut"
                            className="h-auto w-auto max-w-[20px] max-h-[20px]"
                            height={30}
                            width={30}
                            src="https://www.svgrepo.com/show/509075/cut.svg"
                        />
                        <span className="ml-2">Split <span className="text-xs">(S)</span></span>
                    </button>
                    {/* Duplicate */}
                    <button
                        onClick={handleDuplicate}
                        className="bg-white border rounded-md border-transparent transition-colors flex flex-row items-center justify-center text-gray-800 hover:bg-[#ccc] dark:hover:bg-[#ccc] mt-2 font-medium text-sm sm:text-base h-auto px-2 py-1 sm:w-auto"
                    >
                        <Image
                            alt="cut"
                            className="h-auto w-auto max-w-[20px] max-h-[20px]"
                            height={30}
                            width={30}
                            src="https://www.svgrepo.com/show/521623/duplicate.svg"
                        />
                        <span className="ml-2">Duplicate <span className="text-xs">(D)</span></span>
                    </button>
                    {/* Delete */}
                    <button
                        onClick={handleDelete}
                        className="bg-white border rounded-md border-transparent transition-colors flex flex-row items-center justify-center text-gray-800 hover:bg-[#ccc] dark:hover:bg-[#ccc] mt-2 font-medium text-sm sm:text-base h-auto px-2 py-1 sm:w-auto"
                    >
                        <Image
                            alt="Delete"
                            className="h-auto w-auto max-w-[20px] max-h-[20px]"
                            height={30}
                            width={30}
                            src="https://www.svgrepo.com/show/511788/delete-1487.svg"
                        />
                        <span className="ml-2">Delete <span className="text-xs">(Del)</span></span>
                    </button>
                </div>

                {/* Timeline Zoom */}
                <div className="flex flex-row justify-between items-center gap-2 mr-4">
                    <label htmlFor="timelineZoomRange" className="block text-sm mt-1 font-semibold text-white">Zoom</label>
                    <span className="text-white text-lg">-</span>
                    <input
                        type="range"
                        min={30}
                        max={120}
                        step="1"
                        value={timelineZoom}
                        id="timelineZoomRange"
                        aria-label="Timeline Zoom"
                        onChange={(e) => throttledZoom(Number(e.target.value))}
                        className="w-[100px] bg-darkSurfacePrimary border border-white border-opacity-10 shadow-md text-white rounded focus:outline-none focus:border-white-500"
                    />
                    <span className="text-white text-lg">+</span>
                </div>
            </div>

            <div
                className="relative overflow-x-auto w-full border-t border-gray-800 bg-[#1E1D21] z-10"
                ref={timelineRef}
                onClick={handleClick}
            >
                {/* Timeline Header */}
                <Header />

                <div className="bg-[#1E1D21] w-full">
                    {/* Timeline cursor */}
                    {/* eslint-disable-next-line */}
                    <div
                        className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-50"
                        style={{
                            left: `${currentTime * timelineZoom}px`,
                        }}
                    />
                    {/* Timeline elements */}
                    <div className="w-full">

                        <div className="relative h-16 z-10">
                            <VideoTimeline />
                        </div>

                        <div className="relative h-16 z-10">
                            <AudioTimeline />
                        </div>

                        <div className="relative h-16 z-10">
                            <ImageTimeline />
                        </div>

                        <div className="relative h-16 z-10">
                            <TextTimeline />
                        </div>

                    </div>
                </div>
            </div >
            <GlobalKeyHandlerProps handleDuplicate={handleDuplicate} handleSplit={handleSplit} handleDelete={handleDelete} />
        </div>

    );
};

export default memo(Timeline)
