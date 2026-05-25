import "./index.css";
import { Composition } from "remotion";
import {
  PrismMarketingVideo,
  PrismThumbnail,
  VIDEO_DURATION_FRAMES,
} from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PrismMarketingLandscape"
        component={PrismMarketingVideo}
        defaultProps={{ variant: "landscape" }}
        durationInFrames={VIDEO_DURATION_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="PrismMarketingVertical"
        component={PrismMarketingVideo}
        defaultProps={{ variant: "vertical" }}
        durationInFrames={VIDEO_DURATION_FRAMES}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="PrismThumbnail"
        component={PrismThumbnail}
        durationInFrames={1}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};
