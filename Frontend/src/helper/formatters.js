export const formatNumber = (num) => {
  if (num == null) return "-";

  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1).replace(".0", "")} Billion`;
  }

  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1).replace(".0", "")} Million`;
  }

  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1).replace(".0", "")}K`;
  }

  return num.toString();
};
export const formatDateTime = (date) =>
  new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
