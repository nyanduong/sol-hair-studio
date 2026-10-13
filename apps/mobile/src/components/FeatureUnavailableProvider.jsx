import { createContext, useContext, useState } from 'react'
import FeatureUnavailableModal from './FeatureUnavailableModal.jsx'

const FeatureUnavailableContext = createContext(null)

export function useFeatureUnavailable() {
  const showFeature = useContext(FeatureUnavailableContext)
  if (!showFeature) throw new Error('useFeatureUnavailable requires FeatureUnavailableProvider')
  return showFeature
}

export default function FeatureUnavailableProvider({ children }) {
  const [feature, setFeature] = useState(null)
  return (
    <FeatureUnavailableContext.Provider value={setFeature}>
      {children}
      <FeatureUnavailableModal feature={feature} onClose={() => setFeature(null)} />
    </FeatureUnavailableContext.Provider>
  )
}
