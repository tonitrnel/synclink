export interface ViewerProps {
    resourceId: string;
    src: string;
    filename: string;
    mimetype: string;
    caption?: string;
    tags?: string[];
    onReady(): void;
    onError(error: unknown): void;
}
