import { useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import { MapPin, Phone, Building2 } from 'lucide-react';
import type { Centre } from '../types/institute';

interface CentreMarkerProps {
  centre: Centre;
  isSelected: boolean;
  onSelect: (centre: Centre) => void;
}

function CentreMarker({ centre, isSelected, onSelect }: CentreMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: centre.lat, lng: centre.lng }}
        onClick={() => onSelect(centre)}
        title={centre.name}
      >
        <Pin
          background={centre.isHeadOffice ? '#0B1E3D' : '#1D4ED8'}
          borderColor="#FFFFFF"
          glyphColor="#FFFFFF"
          scale={centre.isHeadOffice ? 1.25 : 1.0}
        />
      </AdvancedMarker>
      {isSelected && marker && (
        <InfoWindow
          anchor={marker}
          maxWidth={280}
          onCloseClick={() => onSelect(centre)}
        >
          <div className="p-1 text-slate-900">
            <p className="text-xs font-semibold text-blue-700">
              {centre.isHeadOffice ? 'Head Office' : `${centre.district} District Centre`} · {centre.code}
            </p>
            <h4 className="mt-1 text-sm font-bold leading-snug">{centre.name}</h4>
            <p className="mt-1 text-xs text-slate-600">{centre.address}</p>
            <p className="mt-1.5 font-mono text-xs text-slate-800">{centre.mobile}</p>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

interface CentreLocatorMapProps {
  centres: Centre[];
  selectedDistrict?: string;
  heightClass?: string;
}

export function CentreLocatorMap({
  centres,
  selectedDistrict = 'All',
  heightClass = 'h-[420px]',
}: CentreLocatorMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const visibleCentres =
    selectedDistrict === 'All'
      ? centres
      : centres.filter((c) => c.district === selectedDistrict);

  const [activeCentre, setActiveCentre] = useState<Centre | null>(
    visibleCentres[0] || centres[0] || null
  );

  const mapCenter = activeCentre
    ? { lat: activeCentre.lat, lng: activeCentre.lng }
    : { lat: 26.18, lng: 90.85 };

  if (!apiKey) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Assam Multi-District Centre Directory
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Interactive map preview requires a configured Google Maps browser key. Verified
              coordinates and addresses for all centres are listed below.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCentres.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <p className="font-mono text-xs text-blue-700">
                {c.code} · {c.district}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{c.name}</p>
              <p className="mt-1 text-xs text-slate-600">{c.address}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12 items-stretch">
      <div className="lg:col-span-8 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        <div className={`w-full ${heightClass}`}>
          <APIProvider apiKey={apiKey} libraries={['marker']} language="en" region="IN">
            <GoogleMap
              mapId="DEMO_MAP_ID"
              defaultCenter={mapCenter}
              center={mapCenter}
              defaultZoom={selectedDistrict === 'All' ? 8 : 12}
              gestureHandling="cooperative"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              className="h-full w-full"
            >
              {visibleCentres.map((centre) => (
                <CentreMarker
                  key={centre.id}
                  centre={centre}
                  isSelected={activeCentre?.id === centre.id}
                  onSelect={(c) =>
                    setActiveCentre((prev) => (prev?.id === c.id ? null : c))
                  }
                />
              ))}
            </GoogleMap>
          </APIProvider>
        </div>
      </div>

      <div className="lg:col-span-4 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4">
        <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
          {visibleCentres.map((centre) => {
            const active = activeCentre?.id === centre.id;
            return (
              <button
                key={centre.id}
                type="button"
                onClick={() => setActiveCentre(centre)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  active
                    ? 'border-blue-700 bg-blue-50/60'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-mono font-medium text-blue-800">{centre.code}</span>
                  <span>{centre.isHeadOffice ? 'Head Office' : centre.district}</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-900">{centre.name}</p>
                <p className="mt-1 text-xs text-slate-600 line-clamp-2">{centre.address}</p>
              </button>
            );
          })}
        </div>
        {activeCentre && (
          <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600 space-y-1">
            <div className="flex items-center gap-2 font-medium text-slate-900">
              <Building2 className="h-4 w-4 text-blue-700 shrink-0" />
              <span className="truncate">{activeCentre.district}, Assam</span>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <Phone className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <span>{activeCentre.mobile}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
