import { Building2Icon, GlobeIcon, HouseIcon, MapPinIcon, MountainIcon } from "lucide-react";

export function locationIcon(type?: string) {
  switch (type?.toLowerCase()) {
    case "world": return GlobeIcon;
    case "region": return MountainIcon;
    case "city": case "district": return Building2Icon;
    case "building": case "tavern": case "room": return HouseIcon;
    default: return MapPinIcon;
  }
}

