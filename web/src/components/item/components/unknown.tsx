import { FC } from "react";
import { useEntityConsumer } from "../entity-provider";
import { Metadata } from "./metadata";
import { Menu } from "./menu";

export const UnknownItem: FC = () => {
    const entity = useEntityConsumer();
    return (
      <>
        <div className="synclink-item-header">
          <p className="synclink-item-title">{entity.name}</p>
        </div>
        <div className="mt-4 flex justify-between">
          <Metadata entity={entity} />
          <Menu entity={entity} />
        </div>
      </>
    );
  };