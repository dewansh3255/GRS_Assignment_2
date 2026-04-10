import React, { useState, useEffect } from 'react';

interface VirtualKeyboardProps {
  onKeyPress: (key: string) => void;
  onDelete: () => void;
  onClear: () => void;
  disabled?: boolean;
}

const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({ 
  onKeyPress, 
  onDelete, 
  onClear, 
  disabled = false 
}) => {
  const [keys, setKeys] = useState<string[]>([]);

  // Shuffle the digits 0-9 on component mount to prevent click-tracking attacks
  useEffect(() => {
    const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    setKeys(digits);
  }, []);

  if (keys.length === 0) return null;

  return (
    <div className="w-full max-w-[280px] mx-auto mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl shadow-sm">
      <div className="text-xs text-center text-gray-500 mb-3 font-medium">
        Secure Virtual Keyboard (Randomized)
      </div>
      <div className="grid grid-cols-3 gap-2">
        {/* Render the first 9 shuffled digits */}
        {keys.slice(0, 9).map((key) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onKeyPress(key)}
            className="p-3 text-xl font-semibold bg-white border border-gray-300 hover:bg-gray-100 rounded-lg shadow-sm active:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {key}
          </button>
        ))}

        {/* Bottom Row: Clear, Last Digit, Delete */}
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          className="p-3 text-sm font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg shadow-sm active:bg-red-200 disabled:opacity-50 transition-colors"
        >
          Clear
        </button>
        
        <button
          key={keys[9]}
          type="button"
          disabled={disabled}
          onClick={() => onKeyPress(keys[9])}
          className="p-3 text-xl font-semibold bg-white border border-gray-300 hover:bg-gray-100 rounded-lg shadow-sm active:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          {keys[9]}
        </button>
        
        <button
          type="button"
          disabled={disabled}
          onClick={onDelete}
          className="p-3 text-sm font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 border border-gray-300 rounded-lg shadow-sm active:bg-gray-400 disabled:opacity-50 transition-colors flex items-center justify-center"
        >
          Del ⌫
        </button>
      </div>
    </div>
  );
};

export default VirtualKeyboard;