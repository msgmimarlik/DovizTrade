const HeroSection = () => {
  return (
    <section className="relative bg-gradient-to-br from-primary to-primary/80 py-12 md:py-20 overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-10 left-10 w-72 h-72 bg-secondary rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-secondary rounded-full blur-3xl" />
      </div>
      <div className="container mx-auto px-4 relative z-10">
        <h1 className="font-display text-3xl md:text-5xl font-bold text-primary-foreground text-center mb-4 animate-fade-in-up">
          Döviz & Altın Al-Sat Platformu
        </h1>
        <p className="text-primary-foreground/80 text-center text-lg max-w-xl mx-auto">
          Güvenilir kullanıcılarla döviz ve altın alım satım ilanlarını keşfedin.
        </p>
      </div>
    </section>
  );
};

export default HeroSection;
