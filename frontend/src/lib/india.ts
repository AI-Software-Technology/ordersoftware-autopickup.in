// Indian states / UTs + a lookup for common cities, so typing "Delhi" suggests "Delhi" (not a leftover default state).

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal'
];

const CITY_STATE: Record<string, string> = {
  // Delhi NCR
  'delhi': 'Delhi', 'new delhi': 'Delhi', 'noida': 'Uttar Pradesh', 'greater noida': 'Uttar Pradesh',
  'ghaziabad': 'Uttar Pradesh', 'gurgaon': 'Haryana', 'gurugram': 'Haryana', 'faridabad': 'Haryana',
  // Maharashtra
  'mumbai': 'Maharashtra', 'navi mumbai': 'Maharashtra', 'thane': 'Maharashtra', 'pune': 'Maharashtra',
  'nagpur': 'Maharashtra', 'nashik': 'Maharashtra', 'aurangabad': 'Maharashtra', 'kolhapur': 'Maharashtra',
  'solapur': 'Maharashtra', 'bhiwandi': 'Maharashtra', 'panvel': 'Maharashtra', 'vasai': 'Maharashtra',
  // Gujarat
  'ahmedabad': 'Gujarat', 'surat': 'Gujarat', 'vadodara': 'Gujarat', 'rajkot': 'Gujarat', 'bhavnagar': 'Gujarat',
  'jamnagar': 'Gujarat', 'gandhinagar': 'Gujarat', 'morbi': 'Gujarat', 'anand': 'Gujarat', 'bharuch': 'Gujarat',
  // Rajasthan
  'jaipur': 'Rajasthan', 'jodhpur': 'Rajasthan', 'udaipur': 'Rajasthan', 'kota': 'Rajasthan', 'ajmer': 'Rajasthan',
  'bikaner': 'Rajasthan', 'alwar': 'Rajasthan', 'bhiwadi': 'Rajasthan',
  // Uttar Pradesh
  'lucknow': 'Uttar Pradesh', 'kanpur': 'Uttar Pradesh', 'agra': 'Uttar Pradesh', 'varanasi': 'Uttar Pradesh',
  'meerut': 'Uttar Pradesh', 'allahabad': 'Uttar Pradesh', 'prayagraj': 'Uttar Pradesh', 'bareilly': 'Uttar Pradesh',
  'aligarh': 'Uttar Pradesh', 'moradabad': 'Uttar Pradesh', 'gorakhpur': 'Uttar Pradesh', 'mathura': 'Uttar Pradesh',
  'saharanpur': 'Uttar Pradesh', 'jhansi': 'Uttar Pradesh',
  // Haryana / Punjab / HP / J&K / Chandigarh / Uttarakhand
  'panipat': 'Haryana', 'sonipat': 'Haryana', 'karnal': 'Haryana', 'ambala': 'Haryana', 'hisar': 'Haryana',
  'rohtak': 'Haryana', 'yamunanagar': 'Haryana', 'bahadurgarh': 'Haryana',
  'ludhiana': 'Punjab', 'amritsar': 'Punjab', 'jalandhar': 'Punjab', 'patiala': 'Punjab', 'bathinda': 'Punjab',
  'mohali': 'Punjab', 'chandigarh': 'Chandigarh', 'shimla': 'Himachal Pradesh', 'baddi': 'Himachal Pradesh',
  'srinagar': 'Jammu and Kashmir', 'jammu': 'Jammu and Kashmir',
  'dehradun': 'Uttarakhand', 'haridwar': 'Uttarakhand', 'rudrapur': 'Uttarakhand', 'haldwani': 'Uttarakhand',
  // Madhya Pradesh / Chhattisgarh
  'bhopal': 'Madhya Pradesh', 'indore': 'Madhya Pradesh', 'gwalior': 'Madhya Pradesh', 'jabalpur': 'Madhya Pradesh',
  'ujjain': 'Madhya Pradesh', 'raipur': 'Chhattisgarh', 'bhilai': 'Chhattisgarh', 'bilaspur': 'Chhattisgarh',
  // South
  'bengaluru': 'Karnataka', 'bangalore': 'Karnataka', 'mysore': 'Karnataka', 'mysuru': 'Karnataka',
  'hubli': 'Karnataka', 'mangalore': 'Karnataka', 'belgaum': 'Karnataka',
  'chennai': 'Tamil Nadu', 'coimbatore': 'Tamil Nadu', 'madurai': 'Tamil Nadu', 'salem': 'Tamil Nadu',
  'tiruchirappalli': 'Tamil Nadu', 'trichy': 'Tamil Nadu', 'hosur': 'Tamil Nadu',
  'hyderabad': 'Telangana', 'secunderabad': 'Telangana', 'warangal': 'Telangana',
  'visakhapatnam': 'Andhra Pradesh', 'vijayawada': 'Andhra Pradesh', 'guntur': 'Andhra Pradesh', 'tirupati': 'Andhra Pradesh',
  'kochi': 'Kerala', 'cochin': 'Kerala', 'thiruvananthapuram': 'Kerala', 'trivandrum': 'Kerala', 'kozhikode': 'Kerala',
  'puducherry': 'Puducherry', 'pondicherry': 'Puducherry',
  // East / North-East
  'kolkata': 'West Bengal', 'howrah': 'West Bengal', 'durgapur': 'West Bengal', 'siliguri': 'West Bengal',
  'patna': 'Bihar', 'gaya': 'Bihar', 'muzaffarpur': 'Bihar', 'bhagalpur': 'Bihar',
  'ranchi': 'Jharkhand', 'jamshedpur': 'Jharkhand', 'dhanbad': 'Jharkhand', 'bokaro': 'Jharkhand',
  'bhubaneswar': 'Odisha', 'cuttack': 'Odisha', 'rourkela': 'Odisha',
  'guwahati': 'Assam', 'dibrugarh': 'Assam', 'imphal': 'Manipur', 'shillong': 'Meghalaya',
  'panaji': 'Goa', 'margao': 'Goa', 'vasco da gama': 'Goa', 'silvassa': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman': 'Dadra and Nagar Haveli and Daman and Diu'
};

/** Returns the state for a known city name, or '' when we do not know it. */
export function stateForCity(city: string): string {
  return CITY_STATE[city.trim().toLowerCase().replace(/\s+/g, ' ')] || '';
}
