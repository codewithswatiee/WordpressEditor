import React, { createContext, useState, useContext, useEffect } from 'react';

// Create a context for content management
const ContentContext = createContext();

// Custom hook to use the content context
export const useSelection = () => useContext(ContentContext);

// Provider component for content state
export const SelectionProvider = ({ children }) => {
  const [selectedContent, setSelectedContent] = useState(() => {
    try {
      const storedContent = sessionStorage.getItem('pastedContent');
      return storedContent ? JSON.parse(storedContent) : [];
    } catch (e) {
      console.error('Error parsing stored content:', e);
      return [];
    }
  });

  // Add content to the list
  const addSelectedContent = (content) => {
    setSelectedContent(prev => {
      // Check if we already have this item to avoid duplicates
      const exists = prev.some(item => 
        item.timestamp === content.timestamp
      );
      
      if (exists) return prev;
      const newContent = [content, ...prev];
      
      // Store in sessionStorage
      try {
        sessionStorage.setItem('pastedContent', JSON.stringify(newContent));
      } catch (e) {
        console.error('Error storing pasted content:', e);
      }
      
      return newContent;
    });
  };

  // Clear all content
  const clearSelections = () => {
    setSelectedContent([]);
    sessionStorage.removeItem('pastedContent');
  };

  // Update sessionStorage when content changes
  useEffect(() => {
    try {
      sessionStorage.setItem('pastedContent', JSON.stringify(selectedContent));
    } catch (e) {
      console.error('Error storing pasted content:', e);
    }
  }, [selectedContent]);

  return (
    <ContentContext.Provider value={{ 
        selectedContent, 
        addSelectedContent,
        setSelectedContent,
        clearSelections
    }}>
      {children}
    </ContentContext.Provider>
  );
}; 