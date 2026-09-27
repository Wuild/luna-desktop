export interface Point {x: number; y: number;}
export interface Size {width: number; height: number;}
export interface Rectangle extends Point, Size {}
export interface Monitor extends Rectangle {id: string; index?: number; primary?: boolean;}
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export interface SavedPosition extends Point {
    monitor?: string;
    anchorX?: 'left' | 'right';
    anchorY?: 'top' | 'bottom';
    offsetX?: number;
    offsetY?: number;
}
export interface Cell extends Point {column: number; row: number;}
export interface Grid extends Size {padding: number; gap: number; corner: Corner; areaWidth: number; areaHeight: number; columns: number; rows: number;}
export interface IconItem {file: {get_uri(): string}; drive?: unknown;}
