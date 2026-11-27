import type { SVGProps } from 'react';

const paths = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  market: 'M3 3v18h18 M7 14l4-4 4 2 5-6 M16 6h4v4',
  customers: 'M4 21h16 M6 21V6l6-3 6 3v15 M9 8h.01 M15 8h.01 M9 12h.01 M15 12h.01 M10 21v-5h4v5',
  bidding: 'M8 9l7-7 4 4-7 7z M11 12l7 7 M3 15l4-4 6 6-4 4z M14 21h7',
  contracts: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6',
  recruitment: 'M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M3 21v-2a5 5 0 0 1 5-5h5 M18 14v7 M14.5 17.5h7',
  workforce: 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M21 21v-2a4 4 0 0 0-3-4 M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M17 3.2a4 4 0 0 1 0 7.6',
  staffing: 'M4 7h16v13H4z M9 7V4h6v3 M4 12l8 2 8-2 M12 12v4',
  suppliers: 'M9 3h6v6H9z M3 15h6v6H3z M15 15h6v6h-6z M12 9v3 M6 15v-3h12v3',
  payroll: 'M4 5h16v14H4z M4 9h16 M7 15h3 M14 15h3',
  training: 'M3 5a5 5 0 0 1 4-1c2 0 4 1 5 3 1-2 3-3 5-3a5 5 0 0 1 4 1v14a6 6 0 0 0-4-1c-2 0-4 1-5 2-1-1-3-2-5-2a6 6 0 0 0-4 1z M12 7v13',
  research: 'M9 3h6 M10 3v6l-6 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-9V3 M7 15h10',
  labor: 'M4 5h16v12H9l-5 4z M8 9h8 M8 13h5',
  compliance: 'M12 22s7-3 7-10V6l-7-3-7 3v6c0 7 7 10 7 10z M9 12l2 2 4-4',
  opinion: 'M4 5h13v15H6a2 2 0 0 1-2-2z M17 8h3v10a2 2 0 0 1-2 2 M7 9h7 M7 13h7 M7 17h4',
  finance: 'M3 5h16a2 2 0 0 1 2 2v11a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5z M3 8h16 M21 12h-6a1.5 1.5 0 0 0 0 3h6 M16 13.5h.01',
  rankings: 'M8 3h8v4a4 4 0 0 1-8 0z M8 5H4v2a3 3 0 0 0 4 3 M16 5h4v2a3 3 0 0 1-4 3 M12 11v6 M8 21h8 M9 21v-4h6v4',
  settings: 'M10 2h4l.7 3 2.7 1.5 3-.9 2 3.4-2.3 2.2v3.1l2.3 2.2-2 3.4-3-.9-2.7 1.5-.7 3h-4l-.7-3-2.7-1.5-3 .9-2-3.4 2.3-2.2v-3.1L1.6 9l2-3.4 3 .9L9.3 5z M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6z',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  calendar: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 17h2',
  sun: 'M12 15.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M19 5l-1.5 1.5 M6.5 17.5 5 19',
  moon: 'M20 15A8.8 8.8 0 0 1 9 4a8.5 8.5 0 1 0 11 11z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9z M10 21h4',
  plus: 'M12 5v14 M5 12h14',
  spark: 'M13 2 4 13h7l-1 9 10-12h-8z',
  arrowRight: 'M4 12h15 M13 6l6 6-6 6',
  arrowUp: 'M7 15l10-10 M9 5h8v8',
  arrowDown: 'M7 9l10 10 M9 19h8v-8',
  receipt: 'M5 3v18l3-2 4 2 4-2 3 2V3l-3 2-4-2-4 2z M8 9h8 M8 13h8 M8 17h4',
  checklist: 'M8 5H5v16h14V5h-3 M9 3h6v4H9z M8 12l2 2 5-5 M8 17h7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  alert: 'M10.5 4 2.7 18a1.3 1.3 0 0 0 1.2 2h16.2a1.3 1.3 0 0 0 1.2-2L13.5 4a1.7 1.7 0 0 0-3 0z M12 9v4 M12 16h.01',
  close: 'M6 6l12 12 M18 6 6 18',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  upload: 'M12 16V4 M8 8l4-4 4 4 M4 16v4h16v-4',
  check: 'M5 12l4 4L19 6',
  chart: 'M4 19h16 M6 15l4-5 4 2 4-6 M16 6h2v2',
  dots: 'M5 12h.01 M12 12h.01 M19 12h.01',
  location: 'M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  information: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01',
  refresh: 'M19 9a7 7 0 1 0-.7 7.8 M19 4v5h-5',
  folder: 'M3 6h7l2 3h9v10H3z',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M16 16l5 5',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.65"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
