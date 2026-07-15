export interface Transport {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  subscribe<T>(event: string, callback: (payload: T) => void): () => void;
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  readonly mode: 'http';
  onConnectionChange?: (connected: boolean) => void;
  uploadImage(atomId: string, file: File): Promise<{ image_path: string }>;
  uploadEmbeddedImage(atomId: string, file: File): Promise<{ id: string; content_type: string }>;
  getImageUrl(atomId: string): string;
  deleteImage(atomId: string): Promise<void>;
  deleteEmbeddedImage(atomId: string, imageId: string): Promise<void>;
  uploadDocument(atomId: string, file: File): Promise<{ document_path: string; content_type: string }>;
  getDocumentUrl(atomId: string): string;
  deleteDocument(atomId: string): Promise<void>;
  getConfig(): HttpTransportConfig;
}

export interface HttpTransportConfig {
  baseUrl: string;
  authToken: string;
}
