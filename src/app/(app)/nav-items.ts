import {
  Building2,
  CalendarClock,
  Calculator,
  ChartColumn,
  Clock,
  Contact,
  CreditCard,
  Eye,
  FolderOpen,
  Package,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

// Secciones de la app, en un solo lugar: las usan la barra lateral, la barra inferior del
// teléfono y el buscador ⌘K.
export type NavItem = { href: string; label: string; icon: LucideIcon; count?: number; keywords?: string };
export type NavGroup = { title: string; items: NavItem[] };

export function navGroups({ isMember, works, toReview }: { isMember: boolean; works: boolean; toReview: number }): NavGroup[] {
  // Los invitados externos no tienen organización: solo ven sus proyectos.
  if (!isMember) return [{ title: "Trabajo", items: [{ href: "/proyectos", label: "Proyectos", icon: FolderOpen }] }];
  return [
    {
      title: "Trabajo",
      items: [
        { href: "/proyectos", label: "Proyectos", icon: FolderOpen },
        { href: "/a-revisar", label: "A revisar", icon: Eye, count: toReview, keywords: "piezas renders" },
        { href: "/vencimientos", label: "Vencimientos", icon: CalendarClock, keywords: "fechas agenda" },
        { href: "/horas", label: "Horas", icon: Clock, keywords: "cargar horas" },
      ],
    },
    ...(works
      ? [
          {
            title: "Obra",
            items: [
              { href: "/obras", label: "Obras", icon: Building2, keywords: "ficha" },
              { href: "/analisis-de-precios", label: "Análisis de precios", icon: Calculator, keywords: "apu" },
              { href: "/insumos", label: "Insumos", icon: Package, keywords: "materiales mano de obra equipos precios" },
              { href: "/terceros", label: "Terceros", icon: Contact, keywords: "proveedores comitentes cuit" },
            ],
          },
        ]
      : []),
    {
      title: "Finanzas",
      items: [
        { href: "/recuperado", label: "Lo recuperado", icon: ChartColumn, keywords: "adicionales órdenes de cambio" },
        { href: "/indices", label: "Índices", icon: TrendingUp, keywords: "cac uocra tipo de cambio dólar" },
      ],
    },
    {
      title: "Organización",
      items: [
        { href: "/equipo", label: "Equipo", icon: Users, keywords: "miembros costos" },
        { href: "/plan", label: "Plan", icon: CreditCard, keywords: "pago suscripción" },
      ],
    },
  ];
}

export const isActivePath = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
