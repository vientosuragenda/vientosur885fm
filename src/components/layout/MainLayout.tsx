import React from 'react';
import { Outlet } from 'react-router-dom';
import BottomNavigation from './BottomNavigation';
import TopBar from './TopBar';

const MainLayout: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main className="flex-1 overflow-auto pb-16">
        <div className="container mx-auto px-4 py-2 max-w-2xl">
          <Outlet />
        </div>
      </main>
      <BottomNavigation />
    </div>
  );
};

export default MainLayout;