'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

export default function OtpLogin() {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(45);
  const [isLoading, setIsLoading] = useState(false);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Handle timer countdown
  useEffect(() => {
    if (step !== 'otp' || timeLeft === 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [step, timeLeft]);

  // Handle OTP input changes
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return; // Allow only single digit
    if (!/^\d*$/.test(value)) return; // Allow only digits

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next field
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  // Handle backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  // Handle send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber || phoneNumber.length !== 10) return;

    setIsLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsLoading(false);

    setStep('otp');
    setTimeLeft(45);
    setOtp(['', '', '', '', '', '']);
  };

  // Handle verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.some((digit) => !digit)) return;

    setIsLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsLoading(false);

    console.log('OTP verified:', otp.join(''));
    // Redirect or handle success
  };

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Mask phone for display
  const maskedPhone = phoneNumber
    ? `+91 XXXXXX${phoneNumber.slice(-4)}`
    : '+91 XXXXXX1234';

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header with Logo */}
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Image
              src="/brick-icon.jpg"
              alt="Shubharambha"
              width={32}
              height={32}
              className="w-8 h-8"
            />
            <h1 className="text-3xl font-bold text-gray-900">Shubharambha</h1>
          </div>
          <p className="text-gray-500 text-sm">Construction made transparent</p>
        </div>

        {/* Form Container */}
        <form onSubmit={step === 'phone' ? handleSendOtp : handleVerifyOtp}>
          {step === 'phone' ? (
            // Step 1: Phone Number Input
            <div className="space-y-6">
              <div>
                <label className="block text-gray-900 font-medium mb-3">
                  Enter your mobile number
                </label>

                <div className="flex gap-2">
                  {/* Country code prefix */}
                  <div className="flex items-center px-4 py-3 bg-gray-100 rounded-lg border border-gray-200 font-medium text-gray-600 whitespace-nowrap">
                    +91
                  </div>

                  {/* Phone input */}
                  <input
                    type="tel"
                    placeholder="Enter 10-digit number"
                    value={phoneNumber}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setPhoneNumber(value);
                    }}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-lg"
                  />
                </div>

                <p className="text-gray-500 text-xs mt-2">
                  We&apos;ll send a 6-digit code via SMS
                </p>
              </div>

              <Button
                type="submit"
                disabled={phoneNumber.length !== 10 || isLoading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Sending...' : 'Send OTP'}
              </Button>
            </div>
          ) : (
            // Step 2: OTP Input
            <div className="space-y-6">
              <div>
                <label className="block text-gray-900 font-medium mb-4">
                  Enter the OTP sent to {maskedPhone}
                </label>

                {/* OTP Input Boxes */}
                <div className="flex gap-3 justify-center mb-4">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        if (el) otpInputRefs.current[index] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-12 h-12 text-center text-xl font-semibold border-2 border-gray-300 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                  ))}
                </div>

                {/* Timer */}
                <div className="text-center text-sm text-gray-500 mb-4">
                  {timeLeft > 0 ? (
                    <span>Resend OTP in {formatTime(timeLeft)}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTimeLeft(45);
                        setOtp(['', '', '', '', '', '']);
                        otpInputRefs.current[0]?.focus();
                      }}
                      className="text-orange-600 hover:text-orange-700 font-medium"
                    >
                      Resend OTP
                    </button>
                  )}
                </div>
              </div>

              <Button
                type="submit"
                disabled={otp.some((digit) => !digit) || isLoading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Verifying...' : 'Verify & Continue'}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setOtp(['', '', '', '', '', '']);
                  setTimeLeft(45);
                }}
                className="w-full text-orange-600 hover:text-orange-700 text-sm font-medium"
              >
                Change number
              </button>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-gray-500 text-xs">
            By continuing you agree to our{' '}
            <a href="#" className="text-gray-700 hover:text-gray-900 underline">
              Terms
            </a>
            {' & '}
            <a href="#" className="text-gray-700 hover:text-gray-900 underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
