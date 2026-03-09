interface Window {
  __svelte_devtools__?: {
    getTree(): any[];
    buildGraph(componentId: string | null): { nodes: any[]; edges: any[] };
    componentMap: Map<string, any>;
    signalMap: Map<any, any>;
    effectMap: Map<string, any>;
    startProfiling(): void;
    stopProfiling(): { timings: any[]; effectTimings: any[] };
  };
}
