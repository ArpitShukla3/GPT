const starPositions = [
  { top: '12%', left: '10%', size: '0.28rem', delay: '0s' },
  { top: '18%', left: '78%', size: '0.18rem', delay: '1.5s' },
  { top: '28%', left: '44%', size: '0.22rem', delay: '3s' },
  { top: '36%', left: '16%', size: '0.16rem', delay: '4.2s' },
  { top: '44%', left: '86%', size: '0.24rem', delay: '2.4s' },
  { top: '58%', left: '22%', size: '0.18rem', delay: '5.1s' },
  { top: '66%', left: '72%', size: '0.3rem', delay: '0.8s' },
  { top: '74%', left: '36%', size: '0.16rem', delay: '3.8s' },
  { top: '82%', left: '88%', size: '0.2rem', delay: '2.1s' },
  { top: '88%', left: '14%', size: '0.16rem', delay: '4.7s' },
]

const shootingStars = [
  { top: '15%', left: '-10%', delay: '0s' },
  { top: '34%', left: '-20%', delay: '5s' },
  { top: '62%', left: '-15%', delay: '10s' },
]

function ShootingStarsBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.24),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(168,85,247,0.18),_transparent_28%),linear-gradient(180deg,_rgba(2,6,23,0.92),_rgba(15,23,42,0.82)_42%,_rgba(15,23,42,0.92))] dark:bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.22),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(244,114,182,0.18),_transparent_30%),linear-gradient(180deg,_rgba(2,6,23,0.96),_rgba(15,23,42,0.88)_40%,_rgba(15,23,42,0.96))]" />
      <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_center,rgba(255,255,255,0.2)_0_1px,transparent_1px)] [background-size:4.5rem_4.5rem]" />
      <div className="absolute inset-0 opacity-45 [background-image:radial-gradient(circle_at_center,rgba(125,211,252,0.28)_0_0.08rem,transparent_0.12rem)] [background-size:8rem_8rem]" />

      {starPositions.map((star, index) => (
        <span
          key={`${star.top}-${star.left}-${index}`}
          className="absolute rounded-full bg-sky-100 shadow-[0_0_14px_rgba(186,230,253,0.85)] animate-[star-twinkle_4.5s_ease-in-out_infinite]"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            animationDelay: star.delay,
          }}
        />
      ))}

      {shootingStars.map((star, index) => (
        <span
          key={`${star.top}-${star.left}-${index}`}
          className="absolute h-px w-36 rounded-full bg-gradient-to-r from-transparent via-white/90 to-transparent shadow-[0_0_18px_rgba(255,255,255,0.85)] animate-[shooting-star_7s_linear_infinite]"
          style={{
            top: star.top,
            left: star.left,
            animationDelay: star.delay,
          }}
        />
      ))}
    </div>
  )
}

export default ShootingStarsBackground
