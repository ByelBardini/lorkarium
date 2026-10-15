import evolutivaMark from '@/assets/evolutiva-mark.png';

/** "Desenvolvido por Evolutiva Sistemas", small and muted at the foot of the login.
 *
 *  Example: `<DeveloperCredit />` */
export function DeveloperCredit(): React.JSX.Element {
  return (
    <p className="flex items-center justify-center gap-2 text-xs text-placeholder">
      <img src={evolutivaMark} alt="" width={18} height={18} className="size-[18px] opacity-70" />
      <span>
        Desenvolvido por{' '}
        <a
          href="https://evolutivasistemas.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-primary"
        >
          Evolutiva Sistemas
        </a>
      </span>
    </p>
  );
}
