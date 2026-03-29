import { MapPin, Clock, Heart } from "lucide-react";
import { useState } from "react";

interface ListingCardProps {
  title: string;
  price: number;
  location: string;
  time: string;
  imageUrl: string;
  category: string;
}

const ListingCard = ({ title, price, location, time, imageUrl, category }: ListingCardProps) => {
  const [liked, setLiked] = useState(false);

  return (
    <div className="group bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={imageUrl}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <button
          onClick={() => setLiked(!liked)}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-card/80 backdrop-blur flex items-center justify-center transition-colors hover:bg-card"
        >
          <Heart className={`w-4 h-4 ${liked ? "fill-destructive text-destructive" : "text-muted-foreground"}`} />
        </button>
        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-primary/90 text-primary-foreground text-xs font-medium backdrop-blur">
          {category}
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-display font-semibold text-foreground line-clamp-2 mb-2 group-hover:text-primary transition-colors">
          {title}
        </h3>
        <p className="text-xl font-bold text-primary mb-3">
          {price.toLocaleString("tr-TR")} ₺
        </p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {location}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {time}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ListingCard;
