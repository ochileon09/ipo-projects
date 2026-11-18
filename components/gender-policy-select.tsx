import { genderPolicyLabels, type GenderPolicy } from "@/lib/gender";

export function GenderPolicySelect({ value, onChange, label, root=false, disabled=false }: { value?:GenderPolicy;onChange:(value:GenderPolicy)=>void;label:string;root?:boolean;disabled?:boolean }) {
  return <label>{label}<select disabled={disabled} value={value??(root?"unknown":"inherit")} onChange={event=>onChange(event.target.value as GenderPolicy)}>
    {([...(root?[]:["inherit"]),"unknown","male","female","separate"] as GenderPolicy[]).map(policy=><option key={policy} value={policy}>{genderPolicyLabels[policy]}</option>)}
  </select></label>;
}
