/**
 * Local icon set. Every glyph is drawn on a 24px grid with a 1.5px stroke and
 * square caps so the whole app reads as one family. Names match the old
 * icon-library exports so call sites only change their import path.
 */
import * as React from 'react'

export type IconProps = React.SVGProps<SVGSVGElement>

function make(displayName: string, d: string | string[]) {
  const paths = Array.isArray(d) ? d : [d]
  const Icon = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      {...props}
    >
      {paths.map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  ))
  Icon.displayName = displayName
  return Icon
}

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`

export const AlertCircle = make('AlertCircle', [circle(12, 12, 9), 'M12 7v6', 'M12 16v1'])
export const AlertTriangle = make('AlertTriangle', ['M12 3 2.5 20h19Z', 'M12 10v5', 'M12 17.5v.5'])
export const ArrowLeft = make('ArrowLeft', ['M20 12H5', 'M11 6l-6 6 6 6'])
export const ArrowRight = make('ArrowRight', ['M4 12h15', 'M13 6l6 6-6 6'])
export const ArrowUpDown = make('ArrowUpDown', ['M8 20V4', 'M4 8l4-4 4 4', 'M16 4v16', 'M12 16l4 4 4-4'])
export const BarChart3 = make('BarChart3', ['M4 20V4', 'M4 20h16', 'M9 16v-5', 'M14 16V8', 'M19 16v-3'])
export const Briefcase = make('Briefcase', ['M3 8h18v12H3Z', 'M9 8V4h6v4', 'M3 13h18'])
export const Building2 = make('Building2', ['M5 21V3h10v18', 'M15 9h4v12', 'M3 21h18', 'M8 7h2', 'M8 11h2', 'M8 15h2'])
export const Check = make('Check', 'M4 12.5l5 5L20 6.5')
export const CheckCircle2 = make('CheckCircle2', [circle(12, 12, 9), 'M8 12.5l3 3 5-6'])
export const ChevronDown = make('ChevronDown', 'M6 9l6 6 6-6')
export const CircleDashed = make('CircleDashed', ['M12 3v.01', 'M18.4 5.6v.01', 'M21 12v.01', 'M18.4 18.4v.01', 'M12 21v.01', 'M5.6 18.4v.01', 'M3 12v.01', 'M5.6 5.6v.01'])
export const ClipboardPaste = make('ClipboardPaste', ['M6 5H4v16h16V5h-2', 'M8 3h8v4H8Z', 'M12 11v6', 'M9 14l3 3 3-3'])
export const CloudUpload = make('CloudUpload', ['M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 10a4 4 0 0 1-.5 8', 'M12 20v-8', 'M9 14.5l3-3 3 3'])
export const Columns3 = make('Columns3', ['M3 4h18v16H3Z', 'M9 4v16', 'M15 4v16'])
export const Copy = make('Copy', ['M9 9h11v11H9Z', 'M5 15H4V4h11v1'])
export const Download = make('Download', ['M12 4v11', 'M7 11l5 5 5-5', 'M4 20h16'])
export const ExternalLink = make('ExternalLink', ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'])
export const EyeOff = make('EyeOff', ['M3 3l18 18', 'M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9.5 6a15 15 0 0 1-2.9 3.3', 'M6.5 7.6A15 15 0 0 0 2.5 12C3.5 13.5 7 18 12 18c1.1 0 2.1-.2 3-.5'])
export const FileCheck2 = make('FileCheck2', ['M6 3h8l5 5v13H6Z', 'M14 3v5h5', 'M9 15l2 2 4-4'])
export const FileSearch = make('FileSearch', ['M6 3h8l5 5v13H6Z', 'M14 3v5h5', circle(11, 14, 2.5), 'M13 16l2.5 2.5'])
export const FileText = make('FileText', ['M6 3h8l5 5v13H6Z', 'M14 3v5h5', 'M9 13h7', 'M9 17h7'])
export const FileUp = make('FileUp', ['M6 3h8l5 5v13H6Z', 'M14 3v5h5', 'M12 18v-6', 'M9.5 14.5 12 12l2.5 2.5'])
export const Filter = make('Filter', 'M3 4h18l-7 8.5V19l-4 2v-8.5Z')
export const FolderKanban = make('FolderKanban', ['M3 5h7l2 2h9v13H3Z', 'M8 12v5', 'M12 12v3', 'M16 12v6'])
export const Gauge = make('Gauge', ['M4 18a9 9 0 1 1 16 0', 'M12 18l4-6'])
export const GitCompare = make('GitCompare', [circle(6, 6, 2.5), circle(18, 18, 2.5), 'M6 9v5a4 4 0 0 0 4 4h3', 'M18 15V10a4 4 0 0 0-4-4h-3', 'M9 3 6 6l3 3'])
export const Github = make('Github', ['M9 19c-4 1.5-4-2-6-2.5', 'M15 21v-3.5a3 3 0 0 0-.8-2.3c2.8-.3 5.8-1.4 5.8-6.2a4.8 4.8 0 0 0-1.3-3.3 4.5 4.5 0 0 0-.1-3.3s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.6 5.4 2.9 5.4 2.9a4.5 4.5 0 0 0-.1 3.3A4.8 4.8 0 0 0 4 9.5c0 4.8 3 5.9 5.8 6.2A3 3 0 0 0 9 18v3'])
export const GraduationCap = make('GraduationCap', ['M2 9l10-5 10 5-10 5Z', 'M6 11.5V17c3.5 2.5 8.5 2.5 12 0v-5.5', 'M22 9v6'])
export const GripVertical = make('GripVertical', ['M9 5v.01', 'M9 12v.01', 'M9 19v.01', 'M15 5v.01', 'M15 12v.01', 'M15 19v.01'])
export const Info = make('Info', [circle(12, 12, 9), 'M12 11v6', 'M12 7.5v.01'])
export const KeyRound = make('KeyRound', [circle(8, 15, 4.5), 'M11.5 11.5 20 3', 'M16 7l3 3'])
export const LayoutDashboard = make('LayoutDashboard', ['M3 3h8v10H3Z', 'M13 3h8v6h-8Z', 'M13 11h8v10h-8Z', 'M3 15h8v6H3Z'])
export const Lightbulb = make('Lightbulb', ['M9 18h6', 'M10 21h4', 'M8 14.5A6 6 0 1 1 16 14.5c-.8.8-1 1.5-1 2.5H9c0-1-.2-1.7-1-2.5Z'])
export const Linkedin = make('Linkedin', ['M3 3h18v18H3Z', 'M8 10v7', 'M8 7v.01', 'M12 17v-7', 'M12 13a3 3 0 0 1 6 0v4'])
export const ListChecks = make('ListChecks', ['M3 6l2 2 3-3.5', 'M3 16l2 2 3-3.5', 'M12 6h9', 'M12 17h9'])
export const Loader2 = make('Loader2', 'M12 3a9 9 0 1 0 9 9')
export const LogOut = make('LogOut', ['M10 3H4v18h6', 'M16 7l5 5-5 5', 'M21 12H9'])
export const Mail = make('Mail', ['M3 5h18v14H3Z', 'M3 6l9 7 9-7'])
export const MapPin = make('MapPin', ['M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12Z', circle(12, 9, 2.5)])
export const Menu = make('Menu', ['M3 6h18', 'M3 12h18', 'M3 18h18'])
export const MessageSquarePlus = make('MessageSquarePlus', ['M3 4h18v13H8l-5 4Z', 'M12 8v5', 'M9.5 10.5h5'])
export const Minus = make('Minus', 'M5 12h14')
export const MinusCircle = make('MinusCircle', [circle(12, 12, 9), 'M8 12h8'])
export const Monitor = make('Monitor', ['M3 4h18v12H3Z', 'M8 21h8', 'M12 16v5'])
export const Moon = make('Moon', 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z')
export const MoveRight = make('MoveRight', ['M3 12h17', 'M16 8l4 4-4 4'])
export const Phone = make('Phone', 'M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z')
export const Plus = make('Plus', ['M12 5v14', 'M5 12h14'])
export const Radio = make('Radio', [circle(12, 12, 2), 'M7.5 7.5a6 6 0 0 0 0 9', 'M16.5 7.5a6 6 0 0 1 0 9', 'M4.5 4.5a10 10 0 0 0 0 15', 'M19.5 4.5a10 10 0 0 1 0 15'])
export const RefreshCw = make('RefreshCw', ['M20 11a8 8 0 0 0-14-4L4 9', 'M4 4v5h5', 'M4 13a8 8 0 0 0 14 4l2-2', 'M20 20v-5h-5'])
export const RotateCcw = make('RotateCcw', ['M4 12a8 8 0 1 0 2.5-5.8L4 8.5', 'M4 3v5.5h5.5'])
export const Save = make('Save', ['M4 3h13l3 3v15H4Z', 'M8 3v6h8V3', 'M8 21v-7h8v7'])
export const ScrollText = make('ScrollText', ['M6 3h13v15a3 3 0 0 1-3 3H5a3 3 0 0 0 3-3V6', 'M6 3a3 3 0 0 0-3 3v1h5', 'M12 8h4', 'M11 12h5'])
export const Search = make('Search', [circle(10.5, 10.5, 6.5), 'M15.5 15.5 21 21'])
export const ShieldCheck = make('ShieldCheck', ['M12 3 4 6v6c0 4.5 3.5 8 8 9 4.5-1 8-4.5 8-9V6Z', 'M8.5 12l2.5 2.5 4.5-5'])
export const Shuffle = make('Shuffle', ['M3 7h4c4 0 5 10 10 10h4', 'M3 17h4c1.5 0 2.5-1 3.5-2.5', 'M13.5 9C14.5 8 15.5 7 17 7h4', 'M18 4l3 3-3 3', 'M18 14l3 3-3 3'])
export const SlidersHorizontal = make('SlidersHorizontal', ['M3 6h10', 'M17 6h4', 'M3 12h4', 'M11 12h10', 'M3 18h12', 'M19 18h2', 'M13 4v4', 'M7 10v4', 'M17 16v4'])
export const Star = make('Star', 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.3l1.1-6.2L3 9.7l6.2-.9Z')
export const Sun = make('Sun', [circle(12, 12, 4), 'M12 2v2', 'M12 20v2', 'M2 12h2', 'M20 12h2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'])
export const Table2 = make('Table2', ['M3 4h18v16H3Z', 'M3 10h18', 'M3 15h18', 'M10 10v10'])
export const Trash2 = make('Trash2', ['M4 6h16', 'M9 6V3h6v3', 'M6 6l1 15h10l1-15', 'M10 10v7', 'M14 10v7'])
export const TrendingDown = make('TrendingDown', ['M3 7l6 6 4-4 8 8', 'M21 12v5h-5'])
export const TrendingUp = make('TrendingUp', ['M3 17l6-6 4 4 8-8', 'M21 12V7h-5'])
export const Upload = make('Upload', ['M12 16V5', 'M7 9l5-5 5 5', 'M4 20h16'])
export const UploadCloud = CloudUpload
export const UserCircle = make('UserCircle', [circle(12, 12, 9), circle(12, 10, 3), 'M6 18.5a7 7 0 0 1 12 0'])
export const UserCog = make('UserCog', [circle(9, 8, 4), 'M2 21a7 7 0 0 1 12-4', circle(18, 18, 2), 'M18 14v1', 'M18 21v1', 'M21.5 16l-.9.5', 'M14.5 20l-.9.5'])
export const Users = make('Users', [circle(9, 8, 4), 'M2 21a7 7 0 0 1 14 0', 'M16 4.2a4 4 0 0 1 0 7.6', 'M22 21a7 7 0 0 0-4-6.3'])
export const Wifi = make('Wifi', ['M2 9a15 15 0 0 1 20 0', 'M5.5 12.5a10 10 0 0 1 13 0', 'M9 16a5 5 0 0 1 6 0', 'M12 19.5v.01'])
export const WifiOff = make('WifiOff', ['M3 3l18 18', 'M2 9a15 15 0 0 1 5-3', 'M22 9a15 15 0 0 0-8-3.8', 'M5.5 12.5a10 10 0 0 1 4-2.3', 'M9 16a5 5 0 0 1 6 0', 'M12 19.5v.01'])
export const X = make('X', ['M5 5l14 14', 'M19 5 5 19'])
export const XCircle = make('XCircle', [circle(12, 12, 9), 'M9 9l6 6', 'M15 9l-6 6'])
export const Command = make('Command', 'M9 9V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z')
