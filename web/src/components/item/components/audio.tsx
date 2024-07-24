import { FC } from "react";
import { AudioPlayer } from "~/components/audio-player";
import { useEntityConsumer } from "../entity-provider";
import { Metadata } from "./metadata";
import { Menu } from "./menu";

export const AudioItem: FC = () => {
    const entity = useEntityConsumer();
    return (
      <>
        <AudioPlayer
          className="synclink-item-preview pt-2"
          src={`${__ENDPOINT__}/api/file/${entity.uid}`}
          title={entity.name}
          type={entity.type}
        />
        <div className="mt-4 flex justify-between items-center">
          <Metadata entity={entity} />
          <Menu entity={entity} />
        </div>
      </>
    );
  };