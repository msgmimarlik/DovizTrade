import { Car, Home, Smartphone, Shirt, Dumbbell, BookOpen, Wrench, MoreHorizontal } from "lucide-react";
import { useState } from "react";

const categories = [
  { name: "Tümü", icon: MoreHorizontal, id: "all" },
  { name: "Araç", icon: Car, id: "vehicle" },
  { name: "Emlak", icon: Home, id: "realestate" },
  { name: "Elektronik", icon: Smartphone, id: "electronics" },
  { name: "Giyim", icon: Shirt, id: "clothing" },
  { name: "Spor", icon: Dumbbell, id: "sports" },
  { name: "Kitap", icon: BookOpen, id: "books" },
  { name: "Hizmet", icon: Wrench, id: "services" },
];

interface CategoryFilterProps {
  onCategoryChange?: (category: string) => void;
}

const CategoryFilter = ({ onCategoryChange }: CategoryFilterProps) => {
  const [active, setActive] = useState("all");

  const handleClick = (id: string) => {
    setActive(id);
    onCategoryChange?.(id);
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {categories.map((cat) => {
        const Icon = cat.icon;
        const isActive = active === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => handleClick(cat.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              isActive
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-card text-muted-foreground hover:bg-muted border border-border"
            }`}
          >
            <Icon className="w-4 h-4" />
            {cat.name}
          </button>
        );
      })}
    </div>
  );
};

export default CategoryFilter;
