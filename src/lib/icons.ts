/**
 * Icon compatibility shim: maps Lucide icon names to LineIcons StrokeRounded equivalents.
 * Usage is identical to lucide-react — import icons by their original names and render
 * with className="h-4 w-4". Size is extracted from the h-N class; remaining classes pass through.
 */
import React from "react";
import {
  Wheelchair1StrokeRounded,
  Alarm1StrokeRounded,
  ArrowLeftStrokeRounded,
  ArrowRightStrokeRounded,
  CertificateBadge1StrokeRounded,
  Bell1StrokeRounded,
  BikeStrokeRounded,
  Buildings1StrokeRounded,
  Bus1StrokeRounded,
  Calculator1StrokeRounded,
  CalendarDaysStrokeRounded,
  Car2StrokeRounded,
  CheckStrokeRounded,
  CheckCircle1StrokeRounded,
  ChevronDownStrokeRounded,
  ChevronLeftStrokeRounded,
  ChevronUpStrokeRounded,
  AngleDoubleRightStrokeRounded,
  StopwatchStrokeRounded,
  CloudRainStrokeRounded,
  CompassDrafting2StrokeRounded,
  ServiceBell1StrokeRounded,
  BoxClosedStrokeRounded,
  ClipboardStrokeRounded,
  CreditCardMultipleStrokeRounded,
  Download1StrokeRounded,
  Pencil1StrokeRounded,
  Link2AngularRightStrokeRounded,
  Funnel1StrokeRounded,
  Layout26StrokeRounded,
  HandShakeStrokeRounded,
  Headphone1StrokeRounded,
  HeartStrokeRounded,
  QuestionMarkCircleStrokeRounded,
  HourglassStrokeRounded,
  Camera1StrokeRounded,
  BoxArchive1StrokeRounded,
  Key1StrokeRounded,
  DashboardSquare1StrokeRounded,
  Layout9StrokeRounded,
  Spinner3StrokeRounded,
  Locked1StrokeRounded,
  EnterStrokeRounded,
  ExitStrokeRounded,
  Envelope1StrokeRounded,
  MapPin5StrokeRounded,
  Message2StrokeRounded,
  MenuMeatballs1StrokeRounded,
  PhoneStrokeRounded,
  Aeroplane1StrokeRounded,
  PlusStrokeRounded,
  Code1StrokeRounded,
  RefreshCircle1ClockwiseStrokeRounded,
  FloppyDisk1StrokeRounded,
  Search1StrokeRounded,
  Gear1StrokeRounded,
  Share1StrokeRounded,
  Shield2StrokeRounded,
  Shield2CheckStrokeRounded,
  SlidersHorizontalSquare2StrokeRounded,
  LaptopPhoneStrokeRounded,
  StarFatStrokeRounded,
  BasketShopping3StrokeRounded,
  Database2StrokeRounded,
  LabelDollar2StrokeRounded,
  Ticket1StrokeRounded,
  Trash3StrokeRounded,
  TrendUp1StrokeRounded,
  Upload1StrokeRounded,
  User4StrokeRounded,
  UserMultiple4StrokeRounded,
  Wallet1StrokeRounded,
  XmarkStrokeRounded,
  XmarkCircleStrokeRounded,
  MinusStrokeRounded,
  PenToSquareStrokeRounded,
  EyeStrokeRounded,
  GlobeStandStrokeRounded,
  Home2StrokeRounded,
  Bookmark1StrokeRounded,
  BookmarkCircleStrokeRounded,
  BarChart4StrokeRounded,
  PieChart2StrokeRounded,
  Gauge1StrokeRounded,
  Book1StrokeRounded,
  Notebook1StrokeRounded,
  FileMultipleStrokeRounded,
  BadgeDecagramPercentStrokeRounded,
} from "@lineiconshq/free-icons";

// Tailwind h-N = N × 4px; h-3.5 = 14px, h-4 = 16px, h-5 = 20px, h-6 = 24px, h-8 = 32px, h-10 = 40px
function sizeFromClass(className?: string): number {
  if (!className) return 16;
  const m = className.match(/\bh-(\d+(?:\.\d+)?)\b/);
  if (!m) return 16;
  return Math.round(parseFloat(m[1]) * 4);
}

function cleanClass(className?: string): string | undefined {
  if (!className) return undefined;
  const r = className
    .replace(/\bh-\S+/g, "")
    .replace(/\bw-\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return r || undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyIconFC = React.FC<{ size?: number; color?: string; className?: string; [k: string]: any }>;

function wrap(LI: AnyIconFC): React.FC<React.SVGProps<SVGSVGElement>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon: React.FC<React.SVGProps<SVGSVGElement>> = ({ className, ...rest }: any) =>
    React.createElement(LI, { size: sizeFromClass(className), className: cleanClass(className), ...rest });
  return Icon;
}

export type LucideIcon = React.FC<React.SVGProps<SVGSVGElement>>;

// --- Icon exports (Lucide name → LineIcons StrokeRounded) ---

export const Accessibility = wrap(Wheelchair1StrokeRounded as AnyIconFC);
export const AlertTriangle = wrap(Alarm1StrokeRounded as AnyIconFC);
export const ArrowLeft = wrap(ArrowLeftStrokeRounded as AnyIconFC);
export const ArrowRight = wrap(ArrowRightStrokeRounded as AnyIconFC);
export const BadgeCheck = wrap(CertificateBadge1StrokeRounded as AnyIconFC);
export const Bell = wrap(Bell1StrokeRounded as AnyIconFC);
export const Bike = wrap(BikeStrokeRounded as AnyIconFC);
export const Building2 = wrap(Buildings1StrokeRounded as AnyIconFC);
export const Bus = wrap(Bus1StrokeRounded as AnyIconFC);
export const BusFront = wrap(Bus1StrokeRounded as AnyIconFC);
export const Calculator = wrap(Calculator1StrokeRounded as AnyIconFC);
export const Calendar = wrap(CalendarDaysStrokeRounded as AnyIconFC);
export const CalendarCheck = wrap(CalendarDaysStrokeRounded as AnyIconFC);
export const CalendarClock = wrap(CalendarDaysStrokeRounded as AnyIconFC);
export const CalendarX = wrap(CalendarDaysStrokeRounded as AnyIconFC);
export const Car = wrap(Car2StrokeRounded as AnyIconFC);
export const Check = wrap(CheckStrokeRounded as AnyIconFC);
export const CheckCircle = wrap(CheckCircle1StrokeRounded as AnyIconFC);
export const CheckCircle2 = wrap(CheckCircle1StrokeRounded as AnyIconFC);
export const CheckSquare = wrap(CheckCircle1StrokeRounded as AnyIconFC);
export const ChevronDown = wrap(ChevronDownStrokeRounded as AnyIconFC);
export const ChevronLeft = wrap(ChevronLeftStrokeRounded as AnyIconFC);
export const ChevronRight = wrap(AngleDoubleRightStrokeRounded as AnyIconFC);
export const ChevronUp = wrap(ChevronUpStrokeRounded as AnyIconFC);
export const Clock = wrap(StopwatchStrokeRounded as AnyIconFC);
export const CloudRain = wrap(CloudRainStrokeRounded as AnyIconFC);
export const Compass = wrap(CompassDrafting2StrokeRounded as AnyIconFC);
export const ConciergeBell = wrap(ServiceBell1StrokeRounded as AnyIconFC);
export const Container = wrap(BoxClosedStrokeRounded as AnyIconFC);
export const Copy = wrap(ClipboardStrokeRounded as AnyIconFC);
export const CreditCard = wrap(CreditCardMultipleStrokeRounded as AnyIconFC);
export const Download = wrap(Download1StrokeRounded as AnyIconFC);
export const Edit2 = wrap(Pencil1StrokeRounded as AnyIconFC);
export const ExternalLink = wrap(Link2AngularRightStrokeRounded as AnyIconFC);
export const Eye = wrap(EyeStrokeRounded as AnyIconFC);
export const Filter = wrap(Funnel1StrokeRounded as AnyIconFC);
export const Globe = wrap(GlobeStandStrokeRounded as AnyIconFC);
export const Grid2x2 = wrap(Layout26StrokeRounded as AnyIconFC);
export const Handshake = wrap(HandShakeStrokeRounded as AnyIconFC);
export const Headphones = wrap(Headphone1StrokeRounded as AnyIconFC);
export const Heart = wrap(HeartStrokeRounded as AnyIconFC);
export const HelpCircle = wrap(QuestionMarkCircleStrokeRounded as AnyIconFC);
export const Home = wrap(Home2StrokeRounded as AnyIconFC);
export const Hourglass = wrap(HourglassStrokeRounded as AnyIconFC);
export const Image = wrap(Camera1StrokeRounded as AnyIconFC);
export const ImageIcon = wrap(Camera1StrokeRounded as AnyIconFC);
export const ImagePlus = wrap(Camera1StrokeRounded as AnyIconFC);
export const Inbox = wrap(BoxArchive1StrokeRounded as AnyIconFC);
export const Info = wrap(QuestionMarkCircleStrokeRounded as AnyIconFC);
export const KeyRound = wrap(Key1StrokeRounded as AnyIconFC);
export const LayoutDashboard = wrap(DashboardSquare1StrokeRounded as AnyIconFC);
export const LayoutList = wrap(Layout9StrokeRounded as AnyIconFC);
export const Loader2 = wrap(Spinner3StrokeRounded as AnyIconFC);
export const Lock = wrap(Locked1StrokeRounded as AnyIconFC);
export const LogIn = wrap(EnterStrokeRounded as AnyIconFC);
export const LogOut = wrap(ExitStrokeRounded as AnyIconFC);
export const Mail = wrap(Envelope1StrokeRounded as AnyIconFC);
export const MapPin = wrap(MapPin5StrokeRounded as AnyIconFC);
export const MessageCircle = wrap(Message2StrokeRounded as AnyIconFC);
export const Minus = wrap(MinusStrokeRounded as AnyIconFC);
export const MoreVertical = wrap(MenuMeatballs1StrokeRounded as AnyIconFC);
export const Pencil = wrap(Pencil1StrokeRounded as AnyIconFC);
export const Phone = wrap(PhoneStrokeRounded as AnyIconFC);
export const Plane = wrap(Aeroplane1StrokeRounded as AnyIconFC);
export const Plus = wrap(PlusStrokeRounded as AnyIconFC);
export const QrCode = wrap(Code1StrokeRounded as AnyIconFC);
export const RefreshCw = wrap(RefreshCircle1ClockwiseStrokeRounded as AnyIconFC);
export const Save = wrap(FloppyDisk1StrokeRounded as AnyIconFC);
export const Search = wrap(Search1StrokeRounded as AnyIconFC);
export const Send = wrap(Aeroplane1StrokeRounded as AnyIconFC);
export const Settings2 = wrap(Gear1StrokeRounded as AnyIconFC);
export const Share2 = wrap(Share1StrokeRounded as AnyIconFC);
export const ShieldAlert = wrap(Shield2StrokeRounded as AnyIconFC);
export const ShieldCheck = wrap(Shield2CheckStrokeRounded as AnyIconFC);
export const SlidersHorizontal = wrap(SlidersHorizontalSquare2StrokeRounded as AnyIconFC);
export const Smartphone = wrap(LaptopPhoneStrokeRounded as AnyIconFC);
export const Sparkles = wrap(StarFatStrokeRounded as AnyIconFC);
export const Star = wrap(StarFatStrokeRounded as AnyIconFC);
export const Store = wrap(BasketShopping3StrokeRounded as AnyIconFC);
export const Table2 = wrap(Database2StrokeRounded as AnyIconFC);
export const Tag = wrap(LabelDollar2StrokeRounded as AnyIconFC);
export const Ticket = wrap(Ticket1StrokeRounded as AnyIconFC);
export const Trash2 = wrap(Trash3StrokeRounded as AnyIconFC);
export const TrendingUp = wrap(TrendUp1StrokeRounded as AnyIconFC);
export const Umbrella = wrap(CloudRainStrokeRounded as AnyIconFC);
export const Upload = wrap(Upload1StrokeRounded as AnyIconFC);
export const User2 = wrap(User4StrokeRounded as AnyIconFC);
export const UserCog = wrap(Gear1StrokeRounded as AnyIconFC);
export const UserPlus = wrap(UserMultiple4StrokeRounded as AnyIconFC);
export const Users = wrap(UserMultiple4StrokeRounded as AnyIconFC);
export const Wallet = wrap(Wallet1StrokeRounded as AnyIconFC);
export const X = wrap(XmarkStrokeRounded as AnyIconFC);
export const XCircle = wrap(XmarkCircleStrokeRounded as AnyIconFC);

// Additional icons found in the project
export const BarChart3 = wrap(BarChart4StrokeRounded as AnyIconFC);
export const PieChart = wrap(PieChart2StrokeRounded as AnyIconFC);
export const Gauge = wrap(Gauge1StrokeRounded as AnyIconFC);
export const BookOpen = wrap(Book1StrokeRounded as AnyIconFC);
export const Bookmark = wrap(Bookmark1StrokeRounded as AnyIconFC);
export const BookmarkFilled = wrap(BookmarkCircleStrokeRounded as AnyIconFC);
export const Settings = wrap(Gear1StrokeRounded as AnyIconFC);
export const CalendarRange = wrap(CalendarDaysStrokeRounded as AnyIconFC);
export const Receipt = wrap(Notebook1StrokeRounded as AnyIconFC);
export const Landmark = wrap(Buildings1StrokeRounded as AnyIconFC);
export const Percent = wrap(BadgeDecagramPercentStrokeRounded as AnyIconFC);
export const CircleCheck = wrap(CheckCircle1StrokeRounded as AnyIconFC);
export const Shield = wrap(Shield2StrokeRounded as AnyIconFC);
export const TriangleAlert = wrap(Alarm1StrokeRounded as AnyIconFC);
export const ListChecks = wrap(Layout9StrokeRounded as AnyIconFC);
export const CircleAlert = wrap(Alarm1StrokeRounded as AnyIconFC);
export const SquareParking = wrap(Car2StrokeRounded as AnyIconFC);
export const Bot = wrap(Code1StrokeRounded as AnyIconFC);
export const PenSquare = wrap(PenToSquareStrokeRounded as AnyIconFC);
export const FileText = wrap(FileMultipleStrokeRounded as AnyIconFC);
