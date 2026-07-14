interface Props {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 py-3">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="px-3 py-1 text-sm rounded-btn border border-border dark:border-border-dark text-text-primary dark:text-text-dark-primary hover:bg-accent-bg dark:hover:bg-accent-dark-bg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        上一页
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
        .map((p, idx, arr) => (
          <span key={p} className="flex items-center">
            {idx > 0 && arr[idx - 1] !== p - 1 && (
              <span className="px-1 text-text-secondary dark:text-text-dark-secondary">...</span>
            )}
            <button
              onClick={() => onPageChange(p)}
              className={`px-3 py-1 text-sm rounded-btn transition-colors ${
                p === currentPage
                  ? "bg-accent text-white dark:bg-accent-dark"
                  : "border border-border dark:border-border-dark text-text-primary dark:text-text-dark-primary hover:bg-accent-bg dark:hover:bg-accent-dark-bg"
              }`}
            >
              {p}
            </button>
          </span>
        ))}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-3 py-1 text-sm rounded-btn border border-border dark:border-border-dark text-text-primary dark:text-text-dark-primary hover:bg-accent-bg dark:hover:bg-accent-dark-bg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        下一页
      </button>
    </div>
  );
}
