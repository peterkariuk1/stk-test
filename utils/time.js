export const formatTime = (transTime) => {
  const y = transTime.slice(0, 4);
  const m = transTime.slice(4, 6);
  const d = transTime.slice(6, 8);
  const h = transTime.slice(8, 10);
  const min = transTime.slice(10, 12);

  return `${d}/${m}/${y} ${h}:${min}`;
};

export const currentMonth = () =>
  new Date().toLocaleString("en-US", { month: "long" });
