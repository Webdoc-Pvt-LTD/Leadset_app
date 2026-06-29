import { Loader } from "lucide-react";

export default function LoaderSpinner() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-transparent backdrop-blur-md">
      <Loader className="h-20 w-20 animate-[spin_2s_linear_infinite] text-indigo-600" />
    </div>
  );
}
