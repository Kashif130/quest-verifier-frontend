import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="font-display text-[34px] text-mist-100">Nothing here.</p>
      <p className="text-[14px] text-mist-400">This page doesn't exist.</p>
      <Link to="/" className="text-[14px] text-beacon-300 hover:text-beacon-200">
        Back to the overview
      </Link>
    </div>
  );
}
